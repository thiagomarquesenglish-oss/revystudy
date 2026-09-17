import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useTabVisible } from '@/hooks/useTabVisible';
import { getDecks, getCardsByDeck, addDeck, deleteDeck, saveDecks, resetDeck } from '@/lib/storage';
import { exportDeckAsZip, importDeckFromZip } from '@/lib/deck-io';
import { supabase } from '@/integrations/supabase/client';
import { Deck } from '@/lib/types';
import { Layers, Plus, Trash2, Pencil, Download, Upload, Import, Volume2, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import PageTransition from '@/components/PageTransition';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import DeckAudioPlayer from '@/components/DeckAudioPlayer';
import BackupSettings from '@/components/BackupSettings';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DeckAudio {
  id: string;
  deck_id: string;
  name: string;
  file_path: string;
  created_at: string;
}

export default function LibraryManagePage({ embedded = false, targetDeckId, onChanged }: { embedded?: boolean; targetDeckId?: string; onChanged?: () => void }) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDeck, setShowCreateDeck] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [deckDesc, setDeckDesc] = useState('');
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editDeck, setEditDeck] = useState<Deck | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [deleteDeckId, setDeleteDeckId] = useState<string | null>(null);
  const [deleteDeckName, setDeleteDeckName] = useState('');
  const [deletingDeck, setDeletingDeck] = useState(false);
  const [actionDeck, setActionDeck] = useState<Deck | null>(null);
  const [audios, setAudios] = useState<DeckAudio[]>([]);
  const [actionAudio, setActionAudio] = useState<DeckAudio | null>(null);
  const [editAudio, setEditAudio] = useState<DeckAudio | null>(null);
  const [editAudioName, setEditAudioName] = useState('');
  const [resetDeckTarget, setResetDeckTarget] = useState<Deck | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);
  const loadData = useCallback(async () => {
    try {
      const d = await getDecks();
      setDecks(d);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudios = useCallback(async () => {
    const { data } = await supabase
      .from('deck_audios')
      .select('*')
      .order('created_at', { ascending: true });
    setAudios((data as DeckAudio[]) || []);
  }, []);

  useEffect(() => { loadData(); loadAudios(); }, [loadData, loadAudios]);
  useTabVisible('/library/manage', () => { loadData(); loadAudios(); });

  const handleCreateDeckSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deckName.trim()) return;
    await addDeck(deckName.trim(), deckDesc.trim());
    setDeckName('');
    setDeckDesc('');
    setShowCreateDeck(false);
    loadData();
    onChanged?.(); toast.success('Baralho criado!');
  };

  const handleEditDeck = async () => {
    if (!editDeck || !editName.trim()) return;
    await saveDecks(editDeck.id, { name: editName, description: editDescription });
    setShowEditDialog(false);
    setEditDeck(null);
    loadData();
    onChanged?.(); toast.success('Baralho atualizado!');
  };

  const handleDeleteDeck = async () => {
    if (!deleteDeckId || deletingDeck) return;
    setDeletingDeck(true);
    try {
      await deleteDeck(deleteDeckId);
      toast.success(navigator.onLine ? 'Baralho excluído!' : 'Excluído do aparelho. A exclusão na nuvem será enviada quando conectar.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível excluir o baralho.');
    }
    setDeleteDeckId(null);
    setDeletingDeck(false);
    loadData();
    onChanged?.(); if (targetDeckId) navigate('/decks');
  };

  const handleExport = async (deck: Deck) => {
    setExporting(true);
    try {
      const blob = await exportDeckAsZip(deck);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${deck.name}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Baralho exportado com mídia!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao exportar baralho');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setImporting(true);
    try {
      const result = await importDeckFromZip(file);
      toast.success(`"${result.deckName}" importado com ${result.cardCount} cartões!`);
      if (result.historicalReviewCount > 0 && !result.hasDatedReviewHistory) {
        toast.info(`${result.historicalReviewCount} revisões acumuladas foram preservadas.`, {
          description: 'Este ZIP antigo não contém as datas individuais das revisões, por isso calendário e sequência de dias não podem ser recriados por ele.',
          duration: 9000,
        });
      }
      loadData();
      loadAudios();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Erro ao importar baralho');
    } finally {
      setImporting(false);
    }
  };

  const openEditDeck = (deck: Deck) => {
    setActionDeck(null);
    setEditDeck(deck);
    setEditName(deck.name);
    setEditDescription(deck.description);
    setShowEditDialog(true);
  };

  const openDeleteDeck = (deck: Deck) => {
    setActionDeck(null);
    setDeleteDeckId(deck.id);
    setDeleteDeckName(deck.name);
  };

  const openExportDeck = (deck: Deck) => {
    setActionDeck(null);
    handleExport(deck);
  };

  const openResetDeck = (deck: Deck) => {
    setActionDeck(null);
    setResetDeckTarget(deck);
  };

  const handleResetDeck = async () => {
    if (!resetDeckTarget) return;
    await resetDeck(resetDeckTarget.id);
    setResetDeckTarget(null);
    loadData();
    toast.success('Baralho reiniciado!');
  };

  const handleEditAudioSave = async () => {
    if (!editAudio || !editAudioName.trim()) return;
    await supabase.from('deck_audios').update({ name: editAudioName.trim() }).eq('id', editAudio.id);
    setEditAudio(null);
    loadAudios();
    toast.success('Reprodução atualizada!');
  };

  const handleDeleteAudio = async (audio: DeckAudio) => {
    await supabase.storage.from('deck-audios').remove([audio.file_path]);
    await supabase.from('deck_audios').delete().eq('id', audio.id);
    setActionAudio(null);
    loadAudios();
    toast.success('Reprodução excluída!');
  };

  // Group audios by deck
  const audiosByDeck = audios.reduce<Record<string, DeckAudio[]>>((acc, a) => {
    if (!acc[a.deck_id]) acc[a.deck_id] = [];
    acc[a.deck_id].push(a);
    return acc;
  }, {});

  if (loading && embedded) return null;
  if (loading) {
    return (
      <div className="min-h-screen bg-background safe-bottom">
        <PageHeader title="Baralhos e áudios" onBack={() => navigate('/decks')} />
        <main className="max-w-3xl mx-auto px-3 py-4 space-y-4" style={{ paddingTop: 'calc(var(--app-header-height) + 1rem)' }}>
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </main>
        <BottomNav active="decks" />
      </div>
    );
  }

  return (
    <div className={embedded ? "" : "min-h-screen bg-background safe-bottom"}>
      {embedded && (targetDeckId ? <Button variant="ghost" size="sm" onClick={() => setActionDeck(decks.find(d => d.id === targetDeckId) || null)}>Opções</Button> : <div className="flex gap-2"><Button size="icon" className="h-10 w-10 rounded-full shrink-0" aria-label="Criar baralho" title="Criar baralho" onClick={() => setShowCreateDeck(true)}><Plus className="h-5 w-5" /></Button><Button size="icon" className="h-10 w-10 rounded-full shrink-0" variant="secondary" aria-label="Importar baralho" title="Importar baralho" onClick={() => importInputRef.current?.click()} disabled={importing}><Import className="h-5 w-5" /></Button></div>)}
      {!embedded && <><PageHeader title="Baralhos e áudios" onBack={() => navigate('/decks')} />
      <PageTransition>
        <main className="max-w-3xl mx-auto px-3 py-4 space-y-6 pb-36" style={{ paddingTop: 'calc(var(--app-header-height) + 1rem)' }}>


          {/* Deck list */}
          <div className="space-y-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Meus baralhos</h3>
            {decks.length === 0 ? (
              <div className="text-center py-12">
                <Layers className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground text-sm">Nenhum baralho criado ainda.</p>
              </div>
            ) : (
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                {decks.map((deck, index) => (
                  <button
                    key={deck.id}
                    onClick={() => isMobile ? setActionDeck(deck) : openEditDeck(deck)}
                    className="w-full text-left flex items-center justify-between px-3 sm:px-4 py-3 border-b border-border last:border-b-0 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{deck.name}</p>
                      {deck.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{deck.description}</p>}
                    </div>
                    <Layers className="w-4 h-4 text-muted-foreground shrink-0 ml-2" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Audios section */}
          {audios.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">Reproduções</h3>
              <div className="space-y-3">
                {decks.filter(d => audiosByDeck[d.id]?.length).map(deck => (
                  <div key={deck.id} className="space-y-1.5">
                    <p className="text-xs text-muted-foreground px-1">{deck.name}</p>
                    <div className="space-y-1.5">
                      {audiosByDeck[deck.id].map(audio => (
                        <button
                          key={audio.id}
                          onClick={() => setActionAudio(audio)}
                          className="w-full text-left"
                        >
                          <DeckAudioPlayer audio={audio} onDeleted={loadAudios} hideDelete />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </PageTransition></>}

      {/* Hidden file input for import */}
      <input
        ref={importInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleImport}
      />

      {/* Fixed footer buttons */}
      {!embedded && <div className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-10 px-3 pb-3 pt-2 border-t border-border bg-[#0a0a0a]">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Button onClick={() => setShowCreateDeck(true)} className="gap-2 flex-1">
            <Plus className="w-4 h-4" /> Novo baralho
          </Button>
          <Button
            variant="outline"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="gap-2"
          >
            <Upload className="w-4 h-4" /> {importing ? 'Importando...' : 'Importar'}
          </Button>
        </div>
      </div>

      }
      {/* Mobile actions drawer for decks */}
      <Drawer open={!!actionDeck} onOpenChange={(open) => !open && setActionDeck(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="truncate">{actionDeck?.name}</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            <button className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors" onClick={() => actionDeck && openEditDeck(actionDeck)}>
              <Pencil className="w-5 h-5 text-muted-foreground" /> Renomear
            </button>
            <button className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors" disabled={exporting} onClick={() => actionDeck && openExportDeck(actionDeck)}>
              <Download className="w-5 h-5 text-muted-foreground" /> {exporting ? 'Exportando...' : 'Exportar'}
            </button>
            <button className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-orange-500 hover:bg-secondary transition-colors" onClick={() => actionDeck && openResetDeck(actionDeck)}>
              <RotateCcw className="w-5 h-5" /> Reiniciar aprendizado
            </button>
            <button className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-destructive hover:bg-secondary transition-colors" onClick={() => actionDeck && openDeleteDeck(actionDeck)}>
              <Trash2 className="w-5 h-5" /> Excluir
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Audio actions drawer */}
      <Drawer open={!!actionAudio} onOpenChange={(open) => !open && setActionAudio(null)}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle className="truncate">{actionAudio?.name}</DrawerTitle>
          </DrawerHeader>
          <div className="flex flex-col gap-1 px-4 pb-6">
            <button
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors"
              onClick={() => {
                if (actionAudio) {
                  setEditAudio(actionAudio);
                  setEditAudioName(actionAudio.name);
                  setActionAudio(null);
                }
              }}
            >
              <Pencil className="w-5 h-5 text-muted-foreground" /> Renomear
            </button>
            <button
              className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-destructive hover:bg-secondary transition-colors"
              onClick={() => actionAudio && handleDeleteAudio(actionAudio)}
            >
              <Trash2 className="w-5 h-5" /> Excluir
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Edit audio drawer/dialog */}
      {isMobile ? (
        <Drawer open={!!editAudio} onOpenChange={(open) => !open && setEditAudio(null)}>
          <DrawerContent>
            <DrawerHeader><DrawerTitle>Renomear Reprodução</DrawerTitle></DrawerHeader>
            <div className="space-y-4 px-4 pb-6">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={editAudioName} onChange={e => setEditAudioName(e.target.value)} />
              </div>
              <Button className="w-full" onClick={handleEditAudioSave} disabled={!editAudioName.trim()}>Salvar</Button>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={!!editAudio} onOpenChange={(open) => !open && setEditAudio(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Renomear Reprodução</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input value={editAudioName} onChange={e => setEditAudioName(e.target.value)} autoFocus />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditAudio(null)}>Cancelar</Button>
              <Button onClick={handleEditAudioSave} disabled={!editAudioName.trim()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create deck */}
      {isMobile ? (
        <Drawer open={showCreateDeck} onOpenChange={(open) => {
          setShowCreateDeck(open);
          if (open) {
            document.body.style.overflow = 'hidden';
            document.body.style.position = 'fixed';
            document.body.style.width = '100%';
            document.body.style.top = `-${window.scrollY}px`;
          } else {
            const scrollY = document.body.style.top;
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.top = '';
            window.scrollTo(0, parseInt(scrollY || '0') * -1);
          }
        }}>
          <DrawerContent>
            <DrawerHeader><DrawerTitle>Criar Baralho</DrawerTitle></DrawerHeader>
            <form onSubmit={handleCreateDeckSubmit} className="flex flex-col gap-4 px-4 pb-6">
              <Input placeholder="Nome do baralho" value={deckName} onChange={e => setDeckName(e.target.value)} />
              <Textarea placeholder="Descrição (opcional)" value={deckDesc} onChange={e => setDeckDesc(e.target.value)} rows={2} />
              <Button type="submit" disabled={!deckName.trim()}>Criar</Button>
            </form>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showCreateDeck} onOpenChange={setShowCreateDeck}>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar Baralho</DialogTitle></DialogHeader>
            <form onSubmit={handleCreateDeckSubmit} className="flex flex-col gap-4 mt-2">
              <Input placeholder="Nome do baralho" value={deckName} onChange={e => setDeckName(e.target.value)} autoFocus />
              <Textarea placeholder="Descrição (opcional)" value={deckDesc} onChange={e => setDeckDesc(e.target.value)} rows={2} />
              <Button type="submit" disabled={!deckName.trim()}>Criar</Button>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit deck */}
      {isMobile ? (
        <Drawer open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DrawerContent>
            <DrawerHeader><DrawerTitle>Renomear Baralho</DrawerTitle></DrawerHeader>
            <div className="space-y-4 px-4 pb-6">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome</Label>
                <Input id="edit-name" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-desc">Descrição</Label>
                <Input id="edit-desc" value={editDescription} onChange={e => setEditDescription(e.target.value)} />
              </div>
              <Button className="w-full" onClick={handleEditDeck} disabled={!editName.trim()}>Salvar</Button>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar Baralho</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome</Label>
                <Input id="edit-name" value={editName} onChange={e => setEditName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-desc">Descrição</Label>
                <Input id="edit-desc" value={editDescription} onChange={e => setEditDescription(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="destructive"
                onClick={() => {
                  if (!editDeck) return;
                  setShowEditDialog(false);
                  openDeleteDeck(editDeck);
                }}
              >
                Excluir
              </Button>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancelar</Button>
              <Button onClick={handleEditDeck} disabled={!editName.trim()}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirmation */}
      {isMobile ? (
        <Drawer open={!!deleteDeckId} onOpenChange={(open) => !open && setDeleteDeckId(null)}>
          <DrawerContent>
            <DrawerHeader><DrawerTitle>Excluir baralho</DrawerTitle></DrawerHeader>
            <div className="px-4 pb-6 space-y-4">
              <p className="text-sm text-muted-foreground">Tem certeza que deseja excluir "{deleteDeckName}"? Todos os cartões serão removidos. Esta ação não pode ser desfeita.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setDeleteDeckId(null)}>Cancelar</Button>
                <Button variant="destructive" className="flex-1" disabled={deletingDeck} onClick={handleDeleteDeck}>{deletingDeck ? 'Excluindo…' : 'Excluir'}</Button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <AlertDialog open={!!deleteDeckId} onOpenChange={(open) => !open && setDeleteDeckId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir baralho</AlertDialogTitle>
              <AlertDialogDescription>Tem certeza que deseja excluir "{deleteDeckName}"? Todos os cartões serão removidos. Esta ação não pode ser desfeita.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={deletingDeck} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); void handleDeleteDeck(); }}>{deletingDeck ? 'Excluindo…' : 'Excluir'}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Reset confirmation */}
      {isMobile ? (
        <Drawer open={!!resetDeckTarget} onOpenChange={(open) => !open && setResetDeckTarget(null)}>
          <DrawerContent>
            <DrawerHeader><DrawerTitle>Reiniciar aprendizado</DrawerTitle></DrawerHeader>
            <div className="px-4 pb-6 space-y-4">
              <p className="text-sm text-muted-foreground">Tem certeza que deseja reiniciar "{resetDeckTarget?.name}"? Todos os cartões voltarão ao estado inicial. O histórico geral permanecerá nas estatísticas.</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setResetDeckTarget(null)}>Cancelar</Button>
                <Button className="flex-1 bg-orange-600 text-white hover:bg-orange-700" onClick={handleResetDeck}>Reiniciar</Button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      ) : (
        <AlertDialog open={!!resetDeckTarget} onOpenChange={(open) => !open && setResetDeckTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reiniciar aprendizado</AlertDialogTitle>
              <AlertDialogDescription>Tem certeza que deseja reiniciar "{resetDeckTarget?.name}"? Todos os cartões voltarão ao estado inicial. O histórico geral permanecerá nas estatísticas.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction className="bg-orange-600 text-white hover:bg-orange-700" onClick={handleResetDeck}>Reiniciar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {!embedded && <BottomNav active="decks" />}
    </div>
  );
}
