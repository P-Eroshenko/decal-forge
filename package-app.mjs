import { packager } from '@electron/packager';
const result=await packager({dir:'.',name:'DecalForge',platform:'win32',arch:'x64',out:'dist/1.1.0',overwrite:true,asar:true,ignore:[/^\/(dist|examples|tests|test-output|\.tools)(\/|$)/,/^\/(npm\.tgz|.*-meta\.json|package-app\.mjs)$/],appVersion:'1.1.0',appCopyright:'Decal Forge',win32metadata:{CompanyName:'Decal Forge',FileDescription:'PNG to SVG & trim-sheet cutter',ProductName:'Decal Forge'}});
console.log(result.join('\n'));
