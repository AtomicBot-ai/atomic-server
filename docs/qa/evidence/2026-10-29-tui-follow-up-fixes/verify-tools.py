import os,sys,json,pty,select,fcntl,termios,struct,signal,re,time,pathlib,urllib.request
sys.path.insert(0,'/private/tmp/atomic-qa-pyte')
import pyte
m=json.loads(pathlib.Path(sys.argv[1]).read_text());base=pathlib.Path(m['base']);folder=pathlib.Path(m['data']);
if not base.name.startswith('atomic-qa-') or folder.parent!=base:raise SystemExit('Use a disposable atomic-qa-* data folder.')
ev=base/'fixed-evidence';ev.mkdir(exist_ok=True)
env=os.environ.copy();env.update(ATC_DATA_FOLDER=str(folder),ATOMIC_CORE_DATA_FOLDER=str(base/'app-data'),ATC_UPDATE_CHECK_ON_START='false',NO_COLOR='1',TERM='xterm-256color')
total=int(sys.argv[2]);tag='B19-%d-skills'%total
if not 1<=total<=20:raise SystemExit('Choose 1 to 20 enabled synthetic skills.')
pid,fd=pty.fork()
if pid==0:os.execve(m['binary'],[m['binary'],'--data-folder',str(folder)],env)
fcntl.ioctl(fd,termios.TIOCSWINSZ,struct.pack('HHHH',40,120,0,0));os.kill(pid,signal.SIGWINCH)
screen=pyte.Screen(120,40);stream=pyte.ByteStream(screen)
out=b'';ansi=re.compile(rb'\x1b\[[0-?]*[ -/]*[@-~]')
def frame():
 return '\n'.join(screen.display)
def pump(check=lambda:False,timeout=.3):
 global out
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  if check():return True
  r,_,_=select.select([fd],[],[],.03)
  if r:
   try:data=os.read(fd,262144)
   except OSError:return False
   if not data:return False
   out+=data;stream.feed(data)
 return check()
def wait(label,timeout=8):
 if not pump(lambda:label in frame(),timeout):raise RuntimeError('Not visible: '+label)
def api(op=None,values={}):
 record=json.loads((folder/'atc/run/daemon.json').read_text());token=(folder/'atc/run/admin-token').read_text().strip()
 url=record['admin_url']+('/api/workspace/execute' if op else '/api/workspace')
 req=urllib.request.Request(url,data=json.dumps({'operation':op,'input':values}).encode() if op else None,headers={'Authorization':'Bearer '+token,'x-atc-admin':'1','Content-Type':'application/json'})
 try:return json.load(urllib.request.urlopen(req,timeout=45))
 except urllib.error.HTTPError as e:return {'http':e.code,'body':json.load(e)}
def step(c):
 if 'press' in c:os.write(fd,c['press'].encode());pump(timeout=c.get('settle',.3))
 if 'resize' in c:
  rows,cols=c['resize'];screen.resize(lines=rows,columns=cols);fcntl.ioctl(fd,termios.TIOCSWINSZ,struct.pack('HHHH',rows,cols,0,0));os.kill(pid,signal.SIGWINCH);pump(timeout=.4)
 if 'wait' in c:wait(c['wait'],c.get('timeout',8))
 if 'click' in c:
  wait(c['click']);pump(timeout=.1);rows=frame().split('\n');matches=[(row.index(c['click']),y) for y,row in enumerate(rows) if c['click'] in row]
  x,y=matches[c.get('match',0)];os.write(fd,('\x1b[<0;%d;%dM'%(x+1,y+1)).encode());pump(timeout=c.get('settle',.3))
 if 'api' in c:return api(c['api'],c.get('input',{}))
 if 'snapshot' in c:return api()
 if 'capture' in c:(ev/(c['capture']+'.txt')).write_text(frame().rstrip()+'\n')
 if c.get('quit'):
  os.write(fd,b'\x11');end=time.monotonic()+6
  while time.monotonic()<end:
   done,status=os.waitpid(pid,os.WNOHANG)
   if done:return {'exit':os.waitstatus_to_exitcode(status)}
   pump(timeout=.1)
  return {'exit':None,'frame':frame()}
 return frame()

try:
 for i in range(20):
  name='qa-pass06-%02d'%i
  existing=api('features.get')['skills']
  if not any(row['name']==name for row in existing):
   reply=api('skills.save',{'value':{'name':name,'description':'Synthetic selection fixture','body':'Only a QA fixture.','enabled':True}})
   if 'http' in reply:raise RuntimeError(str(reply))
 for i in range(20):
  name='qa-pass06-%02d'%i
  api('skills.save',{'value':{'id':name,'name':name,'description':'Synthetic selection fixture','body':'Only a QA fixture.','enabled':i<total}})
 features=api('features.get');(ev/(tag+'-feature-count.json')).write_text(json.dumps({'skills':[{'name':s['name'],'enabled':s['enabled']} for s in features['skills']]},indent=2)+'\n')
 step({'wait':'Agents & tools'});step({'click':'Playground'});step({'click':'Tools ▾'});step({'wait':'qa-pass06-00'})
 step({'capture':tag+'-wide-initial'})
 seen=set(re.findall(r'qa-pass06-\d\d',frame()))
 for i in range(45):
  step({'press':'\t','settle':.08});seen.update(re.findall(r'qa-pass06-\d\d',frame()))
 step({'capture':tag+'-wide-after-tab-cycle'})
 for i in range(45):
  step({'press':'\x1b[B','settle':.08});seen.update(re.findall(r'qa-pass06-\d\d',frame()))
 for i in range(15):
  step({'press':'\x1b[<65;60;20M','settle':.06});seen.update(re.findall(r'qa-pass06-\d\d',frame()))
 step({'capture':tag+'-wide-after-wheel'})
 step({'press':'\x1b'});step({'resize':[24,54]});step({'click':'Tools ▾'});step({'wait':'qa-pass06-00'});step({'capture':tag+'-narrow-initial'})
 narrow=set(re.findall(r'qa-pass06-\d\d',frame()))
 for i in range(40):
  step({'press':'\t','settle':.08});narrow.update(re.findall(r'qa-pass06-\d\d',frame()))
 step({'capture':tag+'-narrow-after-tabs'})
 result={'enabled':len([s for s in features['skills'] if s['enabled']]),'wide_reachable_labels':sorted(seen),'narrow_reachable_labels':sorted(narrow),'last_skill_visible':('qa-pass06-%02d'%(total-1)) in seen}
 (ev/(tag+'-navigation-result.json')).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
 step({'quit':True});sys.exit(0 if result['last_skill_visible'] else 1)
finally:
 (base/'B19.raw').write_bytes(out)
 try:os.kill(pid,signal.SIGKILL);os.waitpid(pid,0)
 except (OSError,ChildProcessError):pass
