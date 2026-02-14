/** Character composition type definitions.
 *  Characters are composed of a base animal + optional accessories per evolution stage. */

export type AccessorySlot = 'head' | 'held_left' | 'held_right' | 'back' | 'chest';

export interface AccessoryDef {
  slot: AccessorySlot;
  component: React.FC;
  /** Transform offset relative to animal center */
  offset: { x: number; y: number };
}

export interface CharacterResolution {
  AnimalComponent: React.FC<{ stage: number }>;
  accentColor: string;
}
