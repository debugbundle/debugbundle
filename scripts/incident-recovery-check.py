#!/usr/bin/env python3
"""Bounded real HTTP/storage/crash exercise on disposable, explicitly owned Docker resources."""
import json
import os
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
RUN_ID = uuid.uuid4().hex[:12]
PREFIX = 'debugbundle-recovery-' + RUN_ID
WORK = ROOT / '.tmp' / ('incident-recovery-' + RUN_ID)
WORK.mkdir(parents=True)
MANIFEST = '/workspace/.tmp/incident-recovery-' + RUN_ID + '/state.json'
REPORT = ROOT / 'spec/local' / ('incident-recovery-'+RUN_ID+'.json')
REPORT.parent.mkdir(parents=True, exist_ok=True)
containers = set()
volumes = set()
networks = set()
report = {'run_id': RUN_ID, 'scope': 'isolated_local_real_http_storage', 'production_mutations': False,
          'resource_limits': {'api_cpus': 0.5, 'api_memory_mib': 384, 'worker_cpus': 1, 'worker_memory_mib': 512},
          'samples': [], 'status': 'running'}
env = {'DB_HOST':'postgres','DB_PORT':'5432','DB_USER':'debugbundle','DB_PASSWORD':'debugbundle',
       'DB_NAME':'debugbundle','REDIS_URL':'redis://redis:6379','S3_ENDPOINT':'http://localstack:4566',
       'S3_REGION':'us-east-1','S3_BUCKET':'debugbundle-recovery','AWS_ACCESS_KEY_ID':'test',
       'AWS_SECRET_ACCESS_KEY':'test','ANALYTICS_HASH_SECRET':'local-recovery-only',
       'DEBUGBUNDLE_PROBE_TRIGGER_SECRET':'local-recovery-only','SELFHOST_MODE':'false',
       'API_HOST':'0.0.0.0','API_PORT':'3000','APP_BASE_URL':'http://localhost:3000',
       'AUTH_COOKIE_SECURE':'false','WORKER_HEALTH_PORT':'3001','WORKER_POLL_INTERVAL_MS':'1000'}

def run(args, **kwargs):
    return subprocess.run(args, text=True, capture_output=True, check=True, **kwargs).stdout.strip()

def emit(value):
    print(json.dumps(value), flush=True)

def node_args(phase):
    args = ['docker','run','--rm','--name',PREFIX+'-runner-'+phase,'--network',PREFIX,
            '-v',str(ROOT)+':/workspace','-w','/workspace']
    for key, value in env.items(): args += ['-e', key+'='+value]
    return args + ['node:24-alpine','node','--import','tsx','scripts/incident-recovery-check.mjs',phase,MANIFEST]

def phase(name):
    try:
        output = run(node_args(name), timeout=120)
    except subprocess.CalledProcessError as error:
        (WORK/(name+'-failure.log')).write_text((error.stdout or '')+(error.stderr or ''))
        raise RuntimeError('phase_failed:'+name+':'+(error.stderr or '')[-1500:]) from error
    finally:
        # A timeout can stop the Docker client before its --rm container exits.
        subprocess.run(['docker','rm','-f',PREFIX+'-runner-'+name],capture_output=True)
    values = [json.loads(line) for line in output.splitlines() if line.startswith('{')]
    for value in values: emit(value)
    return values[-1]

def start(name, image, memory, cpus, aliases=(), extra=(), command=(), health=None):
    container = PREFIX+'-'+name
    assert container.startswith(PREFIX+'-')
    args = ['docker','run','-d','--name',container,'--network',PREFIX,'--memory',memory,'--cpus',str(cpus)]
    for alias in aliases: args += ['--network-alias',alias]
    if health:
        args += ['--health-cmd',health,'--health-interval','2s','--health-timeout','2s','--health-retries','40']
    run(args + list(extra) + [image] + list(command), timeout=120)
    containers.add(container)
    return container

def ready(container, timeout=150):
    deadline = time.monotonic()+timeout
    while time.monotonic()<deadline:
        state = json.loads(run(['docker','inspect','--format','{{json .State}}',container]))
        if state.get('Health',{}).get('Status') == 'healthy': return
        if not state.get('Running'): raise RuntimeError('container_start_failed:'+container)
        time.sleep(1)
    raise RuntimeError('container_readiness_timeout:'+container)

def redis_start(durable):
    command = ['redis-server']
    if durable: command += ['--appendonly','yes','--appendfsync','always']
    return start('redis','redis:7','128m',0.25,aliases=['redis'],extra=['-v',PREFIX+'-redis:/data'],
                 command=command,health='redis-cli ping')

def app_start(name):
    extra = ['-v',str(ROOT)+':/workspace','-w','/workspace']
    for key,value in env.items(): extra += ['-e',key+'='+value]
    return start(name,'node:24-alpine','384m' if name=='api' else '512m',0.5 if name=='api' else 1,
                 aliases=[name],extra=extra,command=['node','--import','tsx','apps/'+name+'/src/main.ts'],
                 health='wget -qO- http://127.0.0.1:'+('3000' if name=='api' else '3001')+'/ready >/dev/null')

def stats():
    runtime_containers=sorted(name for name in containers if '-runner-' not in name)
    rows = run(['docker','stats','--no-stream','--format','{{json .}}']+runtime_containers)
    return [{key:row.get(key) for key in ['Name','CPUPerc','MemUsage','BlockIO']} for row in map(json.loads,rows.splitlines())]

def remove_container(container):
    assert container in containers
    run(['docker','rm','-f',container])
    containers.remove(container)

try:
    run(['docker','network','create',PREFIX]); networks.add(PREFIX)
    for name in ['postgres','redis']:
        volume = PREFIX+'-'+name
        run(['docker','volume','create',volume]); volumes.add(volume)
    postgres = start('postgres','postgres:17','384m',0.5,aliases=['postgres'],extra=[
        '-e','POSTGRES_USER=debugbundle','-e','POSTGRES_PASSWORD=debugbundle','-e','POSTGRES_DB=debugbundle',
        '-v',PREFIX+'-postgres:/var/lib/postgresql/data'],health='pg_isready -U debugbundle -d debugbundle')
    redis = redis_start(False)
    s3 = start('localstack','localstack/localstack:4.14.0','768m',0.5,aliases=['localstack'],extra=['-e','SERVICES=s3'],
               health='curl -fsS http://localhost:4566/_localstack/health >/dev/null')
    for container in [postgres,redis,s3]: ready(container)
    phase('seed')
    api = app_start('api'); ready(api)
    phase('preload')
    run(['docker','kill','--signal','KILL',redis]); run(['docker','start',redis]); ready(redis)
    baseline = phase('pending')
    report['snapshot_only_crash'] = {'accepted':150,'pending_after_crash':baseline['pending'],
                                   'lost_queue_entries':150-baseline['pending']}
    assert baseline['pending'] == 0, 'snapshot-only baseline did not reproduce the pending-write gap'
    emit({'baseline_gap_reproduced':report['snapshot_only_crash']})
    # The baseline contained only this run's synthetic unprocessed events. Repeat the workload
    # after configuring durable persistence; no customer or historical queue is touched.
    remove_container(redis)
    redis = redis_start(True); ready(redis)
    phase('preload')
    run(['docker','kill','--signal','KILL',redis])
    remove_container(redis)
    redis = redis_start(True); ready(redis)
    persisted = phase('pending')
    assert persisted['pending'] == 150, 'durable Redis recreation lost accepted queue entries'
    report['aof_recreation'] = persisted
    worker = app_start('worker'); ready(worker)
    with (WORK/'load.log').open('w') as log:
        load = subprocess.Popen(node_args('load'), stdout=log, stderr=subprocess.STDOUT, text=True)
        containers.add(PREFIX+'-runner-load')
        deadline = time.monotonic()+60
        while time.monotonic()<deadline:
            before = phase('progress')
            if before['running']>0: break
            time.sleep(0.5)
        assert before['running']>0, 'worker never claimed a job during load'
        run(['docker','kill','--signal','KILL',worker])
        stranded = phase('progress')
        assert stranded['running']>0, 'crash did not leave an in-flight journal lease'
        report['worker_crash'] = stranded
        run(['docker','start',worker]); ready(worker)
        restart_started=time.monotonic()
        run(['docker','restart',redis]); ready(redis)
        report['redis_restart_during_load_seconds']=round(time.monotonic()-restart_started,3)
        deadline = time.monotonic()+150
        while load.poll() is None and time.monotonic()<deadline:
            report['samples'].append(stats())
            time.sleep(5)
        if load.poll() is None:
            load.terminate(); load.wait(timeout=10)
            raise RuntimeError('load_generator_timeout')
        assert load.returncode == 0, (WORK/'load.log').read_text()[-2000:]
        containers.remove(PREFIX+'-runner-load')
    report['load'] = [json.loads(line) for line in (WORK/'load.log').read_text().splitlines() if line.startswith('{')]
    deadline = time.monotonic()+480
    while time.monotonic()<deadline:
        progress = phase('progress')
        report['samples'].append(stats())
        assert progress['failed'] == 0, 'durable jobs exhausted retries'
        if progress['pending']==0 and progress['running']==0 and progress['occurrences']==2100: break
        time.sleep(5)
    assert progress['pending']==0 and progress['running']==0 and progress['occurrences']==2100, 'backlog did not drain'
    report['verification'] = phase('verify')
    logs = subprocess.run(['docker','logs',worker],text=True,capture_output=True,check=True)
    failures=[]
    for line in (logs.stdout+logs.stderr).splitlines():
        try: record=json.loads(line)
        except ValueError: continue
        if record.get('msg') in ['worker_step_failed','worker_jobs_require_attention','worker_startup_failed']:
            failures.append({key:record.get(key) for key in ['msg','step','error_message']})
    report['worker_failures']=failures
    assert not failures, 'worker reported unexpected processing failures'
    report['status']='passed'
except BaseException as error:
    report['status']='failed'
    report['error']=str(error)
    for container in containers:
        log=subprocess.run(['docker','logs','--tail','100',container],text=True,capture_output=True)
        (WORK/(container+'.log')).write_text(log.stdout+log.stderr)
    raise
finally:
    for container in list(containers):
        subprocess.run(['docker','rm','-f',container],capture_output=True)
    for volume in volumes:
        subprocess.run(['docker','volume','rm',volume],capture_output=True)
    for network in networks:
        subprocess.run(['docker','network','rm',network],capture_output=True)
    for path in [WORK/'state.json',WORK/'state.json.tmp']:
        path.unlink(missing_ok=True)
    REPORT.write_text(json.dumps(report,indent=2)+'\n')
    emit({'status':report['status'],'report':str(REPORT),'local_logs':str(WORK)})
