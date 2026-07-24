import { type Card as CardType } from '../api';

export interface Collection {
  id: string;
  title: string;
  scrollCount: number;
  totalCards: number;
}

export interface Scroll {
  id: string;
  title: string;
  collection: string;
  cardCount: number;
  dueCount: number;
  masteredCount: number;
  lastStudied: string;
}

export interface ScrollPageProps {
  initialTag?: string;
  initialCardId?: string;
  onInitialTagUsed?: () => void;
  onInitialCardIdUsed?: () => void;
}

export interface CollectionCardProps {
  collection: Collection;
  onClick?: () => void;
  onManage?: (e: React.MouseEvent) => void;
}

export interface ScrollCardProps {
  scroll: Scroll;
  onStudy?: () => void;
}

export interface AddCardProps {
  label: string;
  onClick?: () => void;
}

export interface ShelfTitleProps {
  children: React.ReactNode;
}

export interface CreateCollectionModalProps {
  visible: boolean;
  cards: CardType[];
  selectedCardIds: string[];
  newCollectionName: string;
  isSubmitting: boolean;
  onVisibleChange: (visible: boolean) => void;
  onCardIdsChange: (ids: string[]) => void;
  onNameChange: (name: string) => void;
  onSubmit: () => Promise<void>;
}

export interface ManageCollectionModalProps {
  visible: boolean;
  cards: CardType[];
  collectionId: string | null;
  onVisibleChange: (visible: boolean) => void;
  onCollectionIdChange: (id: string | null) => void;
  onRefresh: () => void;
}

export interface BatchCardModalProps {
  visible: boolean;
  cards: CardType[];
  selectedIds: Set<string>;
  onVisibleChange: (visible: boolean) => void;
  onSelectedIdsChange: (ids: React.SetStateAction<Set<string>>) => void;
  onRefresh: () => void;
}

export interface CreateCardModalProps {
  visible: boolean;
  question: string;
  answer: string;
  tags: string;
  isSubmitting: boolean;
  onVisibleChange: (visible: boolean) => void;
  onQuestionChange: (q: string) => void;
  onAnswerChange: (a: string) => void;
  onTagsChange: (tags: string) => void;
  onSubmit: () => Promise<void>;
}
