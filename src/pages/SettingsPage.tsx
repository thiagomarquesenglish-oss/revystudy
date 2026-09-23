import SyncUpdatesButton from '@/components/SyncUpdatesButton';
import { useAuth } from '@/hooks/useAuth';
import { Cloud, LogOut, User, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import BackupSettings from '@/components/BackupSettings';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import OfflineMediaSettings from '@/components/OfflineMediaSettings';
import CloudAudioTest from '@/components/CloudAudioTest';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const {isOnline,isSyncing,pendingCount,syncError,syncNow}=useOnlineStatus();
  const [refreshing,setRefreshing]=useState(false);

  const refreshApp=async()=>{
    if(refreshing)return;
    if(!navigator.onLine){toast.error('Conecte-se à internet para procurar uma atualização.');return;}
    setRefreshing(true);
    try{
      if('serviceWorker' in navigator){
        const registrations=await navigator.serviceWorker.getRegistrations();
        const registration=registrations.find(item=>(item.active?.scriptURL||item.waiting?.scriptURL||'').endsWith('/sw.js'));
        if(registration){
          await registration.update();
          const waiting=registration.waiting;
          if(waiting){
            const changed=new Promise<void>(resolve=>{
              const timer=window.setTimeout(resolve,4000);
              navigator.serviceWorker.addEventListener('controllerchange',()=>{window.clearTimeout(timer);resolve();},{once:true});
            });
            waiting.postMessage({type:'SKIP_WAITING'});
            await changed;
          }
        }
      }
      window.location.reload();
    }catch{
      setRefreshing(false);
      toast.error('Não foi possível atualizar agora. Tente novamente.');
    }
  };
  return <div className="min-h-screen bg-background safe-bottom">
    <PageHeader title="Configurações" />
    <main className="max-w-3xl mx-auto px-4 pb-8 space-y-8" style={{ paddingTop: 'calc(var(--app-header-height) + 1.5rem)' }}>
      <section className="space-y-3">
        <h1 className="text-sm font-semibold text-muted-foreground">Conta</h1>
        <div className="flex items-center gap-4 bg-card rounded-2xl p-5">
          <User className="h-6 w-6 shrink-0 text-muted-foreground" />
          <div className="min-w-0"><p className="text-sm break-all">{user?.email}</p><p className="text-xs text-muted-foreground mt-1">Conta conectada</p></div>
        </div>
      </section>
      <section className="bg-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3"><Cloud className="h-6 w-6 shrink-0 text-primary"/><div><h2 className="font-semibold">Cartões na nuvem</h2><p className={`text-sm mt-1 ${syncError?'text-destructive':'text-muted-foreground'}`}>{!isOnline?'Sem internet. Seus cartões continuam seguros neste aparelho.':isSyncing?'Atualizando sua biblioteca na nuvem…':syncError?`Falha no envio: ${syncError}`:pendingCount>0?`${pendingCount} cartões ou baralhos aguardando envio.`:'Sua biblioteca está atualizada na nuvem.'}</p></div></div>
        <Button variant="secondary" className="shrink-0" onClick={()=>void syncNow()} disabled={!isOnline||isSyncing}>{isSyncing?<RefreshCw className="animate-spin"/>:<Cloud/>}{isSyncing?'Enviando…':'Sincronizar agora'}</Button>
      </section>
      <section className="bg-card rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h2 className="font-semibold">Atualizar aplicativo</h2><p className="text-sm text-muted-foreground mt-1">Busca a versão mais recente e recarrega o RevyStudy, como atualizar a página no navegador.</p></div>
        <Button variant="secondary" className="shrink-0" onClick={()=>void refreshApp()} disabled={refreshing}><RefreshCw className={refreshing?'animate-spin':''}/>{refreshing?'Atualizando…':'Atualizar agora'}</Button>
      </section>
      <OfflineMediaSettings />
      <CloudAudioTest />
      <details className="bg-card rounded-2xl p-5"><summary className="font-semibold cursor-pointer">Atualizações</summary><div className="pt-4 flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">Novidades dos seus baralhos</p><SyncUpdatesButton onInstalled={() => {}} /></div></details>
      <details className="bg-card rounded-2xl p-5"><summary className="font-semibold cursor-pointer">Backup e restaurar dados</summary><div className="pt-5"><BackupSettings /></div></details>
      <section className="space-y-3">
        <Button variant="ghost" className="text-destructive hover:text-destructive justify-start px-0" onClick={signOut}><LogOut className="h-4 w-4 mr-2" />Sair da conta</Button>
      </section>
      <p className="pb-4 text-center text-xs text-muted-foreground" aria-label={`Versão do aplicativo ${__APP_VERSION__}`}>RevyStudy · Versão {__APP_VERSION__}</p>
    </main>
  </div>;
}
