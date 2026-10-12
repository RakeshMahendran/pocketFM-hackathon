// Shared colour tokens. Lighting is a scene effect, never a replacement for these base colours.
export const skinPalette = [
  { id: 'light-neutral', name: 'Light neutral', base: '#E5BEA6', shadow: '#C3977F', lip: '#A46768', detail: '#A17763' },
  { id: 'light-warm', name: 'Light warm', base: '#DDB28E', shadow: '#B88C69', lip: '#A36364', detail: '#987355' },
  { id: 'medium-neutral', name: 'Medium neutral', base: '#C79B7F', shadow: '#A47760', lip: '#92585D', detail: '#88654F' },
  { id: 'medium-olive', name: 'Medium muted olive', base: '#B99A76', shadow: '#957758', lip: '#86565A', detail: '#7D654E' },
  { id: 'deep-warm', name: 'Deep warm', base: '#9B6F53', shadow: '#79523D', lip: '#754C50', detail: '#674A38' },
  { id: 'deep-neutral', name: 'Deep neutral', base: '#765344', shadow: '#573A30', lip: '#604047', detail: '#493229' },
];
export const referenceCandidates = [
  { ...skinPalette[0], name: 'A · Soft neutral' },
  { ...skinPalette[1], name: 'B · Soft golden' },
  { ...skinPalette[1], id: 'reference-muted-warm', name: 'C · Muted warm', base: '#D4AA89', shadow: '#B1896C' },
];
