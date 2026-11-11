import '../src/data/index';
import { DEFS } from '../src/data/registry';
const heroes = Object.values(DEFS).filter((d) => d.hero).map((d) => `${d.id}:${d.faction}:${d.name}`);
console.log(heroes.join('\n'));
