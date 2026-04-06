// ── NAMES.JS ── fun random name generator
const ADJECTIVES = [
  'Cosmic','Quantum','Neon','Stellar','Lunar','Solar','Frozen','Silent',
  'Blazing','Ancient','Crimson','Azure','Golden','Shadow','Crystal','Thunder',
  'Mystic','Hollow','Serene','Fierce','Rapid','Clever','Daring','Noble',
  'Witty','Sly','Bold','Calm','Swift','Grim'
];
const NOUNS = [
  'Panda','Falcon','Wizard','Rogue','Titan','Sphinx','Oracle','Phantom',
  'Cipher','Nomad','Vortex','Comet','Nebula','Quasar','Pulsar','Dragon',
  'Hydra','Golem','Specter','Wraith','Knight','Bishop','Rook','Pawn',
  'Jester','Sage','Scout','Bard','Monk','Drake'
];
function randomName() {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return a + n;
}