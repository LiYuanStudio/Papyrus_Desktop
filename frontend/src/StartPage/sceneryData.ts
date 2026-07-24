export type SceneryItem = {
  id: string;
  collectionId: 'setA' | 'setB';
  name: string;
};

export type SceneryCollection = {
  id: 'setA' | 'setB';
  name: string;
};

export const collections: SceneryCollection[] = [
  { id: 'setA', name: '精选集 A' },
  { id: 'setB', name: '精选集 B' },
];

export const sceneryItems: SceneryItem[] = [
  { id: 'setA-01', collectionId: 'setA', name: 'A-01' },
  { id: 'setA-02', collectionId: 'setA', name: 'A-02' },
  { id: 'setA-03', collectionId: 'setA', name: 'A-03' },
  { id: 'setA-04', collectionId: 'setA', name: 'A-04' },
  { id: 'setA-05', collectionId: 'setA', name: 'A-05' },
  { id: 'setA-06', collectionId: 'setA', name: 'A-06' },
  { id: 'setA-07', collectionId: 'setA', name: 'A-07' },
  { id: 'setA-08', collectionId: 'setA', name: 'A-08' },
  { id: 'setA-09', collectionId: 'setA', name: 'A-09' },
  { id: 'setA-10', collectionId: 'setA', name: 'A-10' },
  { id: 'setA-11', collectionId: 'setA', name: 'A-11' },
  { id: 'setA-12', collectionId: 'setA', name: 'A-12' },
  { id: 'setB-01', collectionId: 'setB', name: 'B-01' },
  { id: 'setB-02', collectionId: 'setB', name: 'B-02' },
  { id: 'setB-03', collectionId: 'setB', name: 'B-03' },
  { id: 'setB-04', collectionId: 'setB', name: 'B-04' },
  { id: 'setB-05', collectionId: 'setB', name: 'B-05' },
  { id: 'setB-06', collectionId: 'setB', name: 'B-06' },
  { id: 'setB-07', collectionId: 'setB', name: 'B-07' },
  { id: 'setB-08', collectionId: 'setB', name: 'B-08' },
  { id: 'setB-09', collectionId: 'setB', name: 'B-09' },
  { id: 'setB-10', collectionId: 'setB', name: 'B-10' },
  { id: 'setB-11', collectionId: 'setB', name: 'B-11' },
  { id: 'setB-12', collectionId: 'setB', name: 'B-12' },
];