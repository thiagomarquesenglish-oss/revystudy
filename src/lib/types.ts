export type CardStatus = 'new' | 'learning' | 'review' | 'relearning';
export type CardType = 'standard' | 'typing';

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  deckId: string;
  audioId: string | null;
  status: CardStatus;
  interval: number;
  easeFactor: number;
  stepsIndex: number;
  repetition: number;
  reviewCount: number;
  lapseCount: number;
  dueDate: string;
  createdAt: string;
  updatedAt: string;
  flagged: boolean;
  cardType: CardType;
}

export interface Deck {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  contentUpdatedAt: string;
  cardCount: number;
  audioCount: number;
}

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface StudyStats {
  totalReviewed: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
}
