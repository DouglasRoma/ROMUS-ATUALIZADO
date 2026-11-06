const fs=require('node:fs/promises'),path=require('node:path'),esbuild=require('esbuild');
(async()=>{
 const root=path.resolve(__dirname,'..'),engine=path.resolve(root,'../.obsidian/plugins/image-atlas');
 await fs.mkdir(path.join(root,'dist'),{recursive:true});
 const source=await fs.readFile(path.join(engine,'main.js'),'utf8');
 const standalone=source.replace('if (ms < 86400000) return','if (ms < 23.5 * 3600000) return').replaceAll('Editar nota no Obsidian','Editar nota').replaceAll('Editar no Obsidian','Editar nota').replaceAll('pelo Obsidian','pelo editor').replaceAll('do cofre','da biblioteca');
 await fs.writeFile(path.join(root,'src/engine.cjs'),standalone);
 await fs.writeFile(path.join(root,'resources/engine-origin.json'),JSON.stringify({name:'Image Atlas',pluginVersion:JSON.parse(await fs.readFile(path.join(engine,'manifest.json'),'utf8')).version,patches:['standalone interface wording','round 24-hour preview as one day']},null,2));
 await fs.copyFile(path.join(engine,'styles.css'),path.join(root,'dist/engine.css'));
 await fs.copyFile(path.join(engine,'vendor/ts-fsrs-LICENSE'),path.join(root,'resources/ts-fsrs-LICENSE'));
 for(const [pkg,license] of [['dompurify','LICENSE'],['marked','LICENSE.md'],['yaml','LICENSE'],['lucide','LICENSE']])await fs.copyFile(path.join(root,'node_modules',pkg,license),path.join(root,'resources',pkg+'-LICENSE.txt'));
 await fs.copyFile(path.join(root,'src/index.html'),path.join(root,'dist/index.html'));
 await fs.copyFile(path.join(root,'src/shell.css'),path.join(root,'dist/shell.css'));
 await esbuild.build({entryPoints:[path.join(root,'src/renderer.js')],bundle:true,outfile:path.join(root,'dist/app.js'),platform:'browser',format:'esm',target:'chrome140',alias:{obsidian:path.join(root,'src/compat.js')},sourcemap:true});
 console.log('Motor Image Atlas copiado e aplicativo compilado sem dados pessoais.');
})().catch(e=>{console.error(e);process.exitCode=1});
