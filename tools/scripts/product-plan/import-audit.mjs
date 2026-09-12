import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// One-time, explicit import of the accepted audit into portable repository docs.
// Usage: node tools/scripts/product-plan/import-audit.mjs AUDIT_DIRECTORY PRD_PDF
const [input, pdfInput] = process.argv.slice(2).map(p => path.resolve(p));
if(!input || !pdfInput) throw new Error('Provide audit directory and original PRD PDF');
const root = path.resolve(import.meta.dirname, '../../..');
const destination = path.join(root, 'docs/product/mvp-2026-09');
const audit = path.join(destination, 'audit');
const sha = p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const expected = '0abae9e27c514a8f0bdef9bd344d1f5eb75f033fb61495f7ebcc6a225c7ceba3';
if(sha(pdfInput)!==expected) throw new Error('PRD does not match accepted source');
fs.mkdirSync(audit,{recursive:true});
fs.mkdirSync(path.join(destination,'source'),{recursive:true});
fs.copyFileSync(pdfInput,path.join(destination,'source/prototype-prd.pdf'));
const foundation=fs.readFileSync(path.join(input,'source/foundation-and-scope.txt'),'utf8');
fs.writeFileSync(path.join(destination,'source/foundation-and-scope.txt'),foundation.replace(/[ \t]+$/gm,'').trimEnd()+'\n');
const captureNames = fs.readdirSync(path.join(input,'screenshots'));
fs.mkdirSync(path.join(audit,'screenshots'),{recursive:true});
const captureMap = new Map();
for(const file of captureNames) {
  const bytes=fs.readFileSync(path.join(input,'screenshots',file));
  const name=bytes[0]===0xff && bytes[1]===0xd8 ? file.replace(/\.png$/,'.jpg') : file;
  captureMap.set(file,name);
  fs.copyFileSync(path.join(input,'screenshots',file),path.join(audit,'screenshots',name));
}
// Existing reviewer render evidence remains source evidence, not UI screenshots.
for(const directory of ['source/rendered','tmp/pdfs']) {
  const full=path.join(input,directory);
  if(!fs.existsSync(full)) continue;
  fs.mkdirSync(path.join(audit,directory),{recursive:true});
  for(const name of fs.readdirSync(full)) if(name.endsWith('.png')) fs.copyFileSync(path.join(full,name),path.join(audit,directory,name));
}
function resolveTarget(target, outputFile) {
  let absolute=target;
  if(target.startsWith(input+'/')) absolute=path.join(audit,target.slice(input.length+1));
  else if(target===pdfInput) absolute=path.join(destination,'source/prototype-prd.pdf');
  else if(target.startsWith(root+'/')) absolute=target;
  else return target;
  const relative=path.relative(path.dirname(outputFile),absolute).replaceAll(path.sep,'/');
  return relative.replace(/screenshots\/([^/]+)$/,(_,name)=>'screenshots/'+(captureMap.get(name)??name));
}
function portableMarkdown(text, outputFile) {
  text=text.replace(/:codex-file-citation\{[^}]+\}/g,'[Accepted PRD](../source/prototype-prd.pdf)');
  text=text.replace(/\]\(<?(\/[^\n)>]+)>?\)/g,(_,target)=>{
    const line=target.match(/:(\d+)$/);
    const file=line?target.slice(0,-line[0].length):target;
    return ']('+resolveTarget(file,outputFile)+(line?'#L'+line[1]:'')+')';
  });
  text=text.replaceAll(root,'owomide_core').replaceAll(input,'docs/product/mvp-2026-09/audit').replaceAll(pdfInput,'source/prototype-prd.pdf');
  text=text.replace(/\/tmp\/owomide-prd-current-review-[^`\s]+/g,'[locally inspected PRD render]');
  const localCompany=path.dirname(root);
  text=text.replaceAll(localCompany,'[local project directory]');
  return text.trimEnd()+'\n';
}
function portableValue(value) {
  if(typeof value==='string') return value.replaceAll(root+'/','').replaceAll(input+'/','docs/product/mvp-2026-09/audit/').replaceAll(pdfInput,'docs/product/mvp-2026-09/source/prototype-prd.pdf').replaceAll(path.dirname(root),'[local project directory]');
  if(Array.isArray(value)) return value.map(portableValue);
  if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,portableValue(v)]));
  return value;
}
const files=fs.readdirSync(input).filter(file=>(file.endsWith('.md')||file.endsWith('.json')) && !['prd-requirements-review.md','AUDIT_FINGERPRINT.json'].includes(file));
for(const file of files) {
  const outputFile=path.join(audit,file),text=fs.readFileSync(path.join(input,file),'utf8');
  fs.writeFileSync(outputFile,file.endsWith('.json')?JSON.stringify(portableValue(JSON.parse(text)),null,2)+'\n':portableMarkdown(text,outputFile));
}
const fingerprint=JSON.parse(fs.readFileSync(path.join(input,'AUDIT_FINGERPRINT.json'),'utf8'));
for(const screenshot of fingerprint.screenshots ?? []) {
  screenshot.originalName=screenshot.name;
  screenshot.name=captureMap.get(screenshot.name)??screenshot.name;
}
fs.writeFileSync(path.join(audit,'AUDIT_FINGERPRINT.json'),JSON.stringify(portableValue(fingerprint),null,2)+'\n');
fs.writeFileSync(path.join(destination,'source/manifest.json'),JSON.stringify({source:'prototype-prd.pdf',sha256:expected,physicalPages:283,requirements:379,acceptedBenchmark:'../audit/MVP_PRD_BENCHMARK.md',sourcePolicy:'Company-provided PRD archived in the existing private company repository. Original PDF bytes unchanged; audit links made repository-relative.'},null,2)+'\n');
console.log(JSON.stringify({importedReports:files.length,acceptedScreenshots:captureNames.length,sourceHash:expected,destination:path.relative(root,destination)},null,2));
