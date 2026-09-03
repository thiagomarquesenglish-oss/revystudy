import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import DictationExercise from '@/components/DictationExercise';
import type { Flashcard } from '@/lib/types';

vi.mock('@/lib/deck-io', () => ({ sanitizeImportedHtml: (html: string) => html }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const card = { id: 'one', front: '<img src="image.png" alt="Answer image"><p>Hidden front text</p>',
  back: '<p>Estou com fome</p>', dictationAnswer: "I'm hungry" } as Flashcard;

describe('listening exercise', () => {
  it('reveals content only after checking and returns a practice result', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    const onNext = vi.fn();
    render(<DictationExercise card={card} audioSrc="https://example.com/a.mp3" onNext={onNext} onSkip={vi.fn()} last={false} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('Hidden front text')).toBeNull();
    expect(screen.queryByText('Estou com fome')).toBeNull();
    expect(screen.getByRole('button', { name: 'Conferir' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('O que você ouviu?'), { target: { value: "I'm angry" } });
    fireEvent.click(screen.getByRole('button', { name: 'Conferir' }));
    expect(screen.getByText('Veja o que ajustar')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Answer image' })).toBeInTheDocument();
    expect(screen.getByText("I'm hungry")).toBeInTheDocument();
    expect(onNext).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Próximo cartão' }));
    expect(onNext).toHaveBeenCalledWith(false);
  });
  it('skips a broken audio without grading it', () => {
    const onNext = vi.fn(), onSkip = vi.fn();
    const { container } = render(<DictationExercise card={card} audioSrc="https://example.com/broken.mp3" onNext={onNext} onSkip={onSkip} last />);
    fireEvent.error(container.querySelector('audio')!);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível reproduzir');
    fireEvent.click(screen.getByRole('button', { name: 'Pular cartão' }));
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onNext).not.toHaveBeenCalled();
  });
});
