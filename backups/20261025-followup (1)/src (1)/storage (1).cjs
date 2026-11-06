const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const ignored=new Set(['.obsidian','.git','node_modules','local-backups','image-atlas-desktop','remnote-rebuild','.trash']);
class Library {
 constructor(root){this.root=path.resolve(root);this.queues=new Map()}
 async resolve(name,allowRoot=false){
  if(typeof name!=='string'||name.includes('\0')||name.includes('\\')||path.isAbsolute(name)||name.split('/').some(p=>p==='..'||p.includes(':')))throw Error('Caminho inválido.');
  const target=path.resolve(this.root,name);if(target!==this.root&&!target.startsWith(this.root+path.sep)||!allowRoot&&target===this.root)throw Error('Caminho fora da biblioteca.');
  let current=this.root;
  for(const piece of path.relative(this.root,target).split(path.sep).filter(Boolean)){current=path.join(current,piece);try{if((await fs.lstat(current)).isSymbolicLink())throw Error('Links de sistema não são permitidos na biblioteca.')}catch(e){if(e.code!=='ENOENT')throw e}}
  return target;
 }
 async list(){const result=[];const walk=async(dir,base='')=>{for(const item of await fs.readdir(dir,{withFileTypes:true})){if(item.isSymbolicLink()||ignored.has(item.name)||item.name.startsWith('.atlas-'))continue;const rel=base+item.name;if(item.isDirectory())await walk(path.join(dir,item.name),rel+'/');else{const stat=await fs.stat(path.join(dir,item.name));result.push({path:rel,stat:{ctime:stat.birthtimeMs,mtime:stat.mtimeMs,size:stat.size}})}}};await fs.mkdir(this.root,{recursive:true});await walk(this.root);return result}
 async read(name,binary=false){const data=await fs.readFile(await this.resolve(name));return binary?data.toString('base64'):data.toString('utf8')}
 async write(name,data,binary=false,create=false){
  const run=async()=>{const dest=await this.resolve(name);await fs.mkdir(path.dirname(dest),{recursive:true});if(create){const handle=await fs.open(dest,'wx');try{await handle.writeFile(binary?Buffer.from(data,'base64'):data,'utf8')}finally{await handle.close()}return}
   const temp=path.join(path.dirname(dest),'.atlas-'+crypto.randomUUID());try{await fs.writeFile(temp,binary?Buffer.from(data,'base64'):data,'utf8');try{await fs.copyFile(dest,dest+'.atlas-backup')}catch(e){if(e.code!=='ENOENT')throw e}await fs.rename(temp,dest)}finally{await fs.rm(temp,{force:true})}};
  const operation=(this.queues.get(name)||Promise.resolve()).catch(()=>{}).then(run);this.queues.set(name,operation);try{await operation}finally{if(this.queues.get(name)===operation)this.queues.delete(name)}
 }
 async rename(from,to){const src=await this.resolve(from),dest=await this.resolve(to);try{await fs.access(dest);throw Error('Já existe um arquivo com esse nome.')}catch(e){if(e.code!=='ENOENT')throw e}await fs.mkdir(path.dirname(dest),{recursive:true});await fs.rename(src,dest)}
 async importFrom(source){source=path.resolve(source);const targetLower=this.root.toLowerCase(),sourceLower=source.toLowerCase();if(targetLower===sourceLower||targetLower.startsWith(sourceLower+path.sep))throw Error('A pasta de importação não pode conter a biblioteca de destino.');const walk=async(dir,base='')=>{for(const item of await fs.readdir(dir,{withFileTypes:true})){if(item.isSymbolicLink()||ignored.has(item.name)||item.name.endsWith('.atlas-backup'))continue;const rel=base+item.name;if(item.isDirectory())await walk(path.join(dir,item.name),rel+'/');else{const dest=await this.resolve(rel);await fs.mkdir(path.dirname(dest),{recursive:true});await fs.copyFile(path.join(dir,item.name),dest)}}};await fs.mkdir(this.root,{recursive:true});await walk(source);try{const metadata=JSON.parse(await fs.readFile(path.join(source,'.obsidian/types.json'),'utf8'));if(metadata.types&&typeof metadata.types==='object'&&!Array.isArray(metadata.types))await this.write('.atlas-property-types.json',JSON.stringify(metadata.types,null,2))}catch(e){if(e.code!=='ENOENT')throw e}try{const settings=JSON.parse(await fs.readFile(path.join(source,'.obsidian/plugins/image-atlas/data.json'),'utf8'));const imported={demoOpened:true,noteRenames:settings.noteRenames||{},pendingMindMoves:settings.pendingMindMoves||[]};await this.write('.atlas-settings.json',JSON.stringify(imported,null,2))}catch(e){if(e.code!=='ENOENT')throw e}}
}
module.exports={Library};
