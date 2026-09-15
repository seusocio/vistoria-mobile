# Galeria da aplicação — captura contínua estilo WhatsApp, preview e purge do storage

## Context

A "Galeria da aplicação" (`src/app/ApplicationFill/index.tsx:580-624`) e as fotos de item
(`src/components/ItemDrawer/index.tsx:159-184`) hoje compartilham o mesmo fluxo:
`Alert.alert('Adicionar foto')` → `ImagePicker.launchCameraAsync` → volta pro app com **uma**
foto. Problemas relatados:

1. **A câmera demora a abrir.** `launchCameraAsync` sobe o `UIImagePickerController` /
   intent do sistema, com cold start a cada disparo. Não existe `expo-camera` no projeto.
2. **Uma foto por vez.** Para N fotos são N cold starts + N confirmações "Usar foto".
3. **Remover foto não apaga os bytes.** Não existe nenhum `ctx.storage.delete` no repo
   (`convex/files.ts` só tem `generateUploadUrl`). `setAttachmentDeletedAt` marca `deletedAt`
   e o blob fica órfão no storage do Convex para sempre.
4. **Não dá para ver a foto.** `PhotoThumb` é um `View` 64x64 não-pressionável — não há
   lightbox/visualizador em lugar nenhum do app.

O upload em background **já existe e funciona** (`src/infra/uploads/upload-store.ts`, zustand,
concorrência 3, retry com backoff, recuperação via `AppState` em `App.tsx:110`, durabilidade
pela linha `uploadStatus: 'pending'` no Convex) — entregue pela Fase 4 de
`plan/optimistic-updates-background-uploads.md`. Idem os optimistic updates, centralizados em
`src/hooks/useApplicationMutations.ts`. **Este plano estende os dois, não os substitui.**

**Resultado esperado:** abrir a câmera é instantâneo, o obturador dispara em sequência sem sair
da tela, as fotos sobem sozinhas enquanto o usuário continua fotografando, "Concluir" fecha a
tela, tocar numa miniatura abre o visualizador em tela cheia, e remover apaga de verdade —
inclusive os bytes no storage — respeitando os 5s de "Desfazer".

**Decisões já tomadas** (confirmadas com o usuário):
- Purge do storage no **`onCommit` do `UndoToast`** (fim da janela de 5s) — o "Desfazer" continua real.
- Nova câmera **e** novo visualizador valem para a **galeria da aplicação e para as fotos de item**.
- **Pode adicionar `expo-camera`** com `npx expo prebuild` + rebuild do dev client.

---

## Invariantes — o que NÃO pode quebrar

Esta é a parte mais importante do plano. Tudo abaixo já funciona hoje e precisa continuar
funcionando depois da mudança.

### A. Optimistic updates

1. **Toda escrita vinda da UI passa por `useApplicationMutations`**, nunca por
   `convexClient.mutation` direto. A `purgeAttachment` nova entra lá com
   `.withOptimisticUpdate` como todas as outras.
2. **Toda nova mutation usa `patchAppEverywhere`** (`useApplicationMutations.ts:18`), que escreve
   nos **três** caches ao mesmo tempo: `findById`, `listAll` e todos os args de
   `listByChecklistId` (via `getAllQueries`). Escrever só em `findById` faz Library/Overview/
   ChecklistDetail ficarem dessincronizados até o servidor responder.
3. **Nenhuma query nova.** A `PhotoCapture` lê a aplicação com
   `useQuery(api.applications.findById, { id: applicationId })` — a mesma query que
   `patchAppEverywhere` já atualiza. Criar um `applications.listAttachments` (por exemplo)
   exigiria mais um branch no helper e é desnecessário.
4. **`useQuery` vem de `convex-helpers/react/cache`**, não de `convex/react` — é a convenção do
   projeto (`useApplicationFill.ts`, `useReport.ts`, `ApplicationNew`) e é o que evita o spinner
   ao entrar/sair da tela de câmera. O `ConvexQueryCacheProvider` já está em `App.tsx`.
5. **Updaters são síncronos e puros.** `purgeAttachment` usa `.filter` / `.map` gerando arrays
   novos; nunca mutar o objeto devolvido por `store.getQuery` (o compilador só garante a parte
   síncrona).
6. **A UI de fotos renderiza da query, não de `useState`.** Galeria e `ItemDrawer` continuam
   lendo `application.attachments` / `item.attachments`. A **única** exceção é o filmstrip da
   `PhotoCapture`, que precisa mostrar o uri cru da câmera nos ~300ms antes do `prepareAsset`
   terminar — e mesmo ele usa o **mesmo `attachment.id`** que a linha do Convex vai receber,
   então não há entidade duplicada.
7. **`useApplicationFill` continua sem buffer local.** Reintroduzir `useState` de `application`
   ali invisibiliza todos os optimistic updates do app (foi exatamente o bug que a Fase 2 do
   plano anterior corrigiu). Não tocar nesse hook.
8. **Chamar mutation e desmontar é seguro.** A função devolvida por `useMutation` é ligada ao
   `ConvexReactClient`, não ao componente: `commitAsset(...)` disparado na `PhotoCapture` seguido
   de `navigation.goBack()` completa normalmente, e o optimistic update permanece aplicado até o
   servidor confirmar. É disso que depende o botão "Concluir" não esperar nada.
9. **`setAttachmentUploaded` / `setAttachmentUploadStatus` continuam sendo chamados pelo
   `convexClient` dentro do upload store, sem optimistic update** — é intencional. O progresso ao
   vivo vem do zustand (`useUploadStore().progress`); o estado final chega pelo sync engine. Não
   "corrigir" isso para usar o hook: o store é module-level e não tem contexto React.
10. **Ordem em rajada.** O Convex executa as mutations do cliente **serialmente, na ordem de
    chamada**. Oito `addAttachment` disparados em sequência chegam em sequência, e os oito
    optimistic updates (cada um `[...attachments, novo]`) compõem na mesma ordem — as fotos não
    embaralham.

### B. Upload em background

1. **Nada na UI espera upload.** `commitAsset` é fire-and-forget; o obturador não bloqueia;
   "Concluir" fecha a tela na hora; sair da `ApplicationFill` no meio do upload não cancela nada
   (o store é module-level, não um `useRef` de componente).
2. **A durabilidade mora na linha do Convex**, não em memória: `uploadStatus: 'pending'` +
   `localUri` apontando para `${documentDirectory}uploads/`. Por isso a cópia que o
   `prepareAsset` faz para o `documentDirectory` é **load-bearing** — o uri que a câmera e o
   picker devolvem fica no diretório de **cache**, que o iOS pode despejar. Não "otimizar"
   enviando o uri de cache direto.
3. **`subscribeToUploadRecovery()` em `App.tsx:110` continua montado** e `resumePending()`
   continua varrendo `api.applications.listAll` atrás de `uploadStatus === 'pending' && localUri`.
   Isso é o que faz um force-quit no meio do upload se recuperar.
4. **`enqueue` deduplica por `attachment.id`** (contra `queue` e `inFlight`) — a varredura de
   recuperação não pode disparar um segundo upload do mesmo anexo. O `cancel()` novo precisa
   manter essa invariante e **não** pode mexer no contador `activeWorkers` do `drainQueue`:
   ele só remove da `queue` e marca em `abandoned`; jobs já em voo terminam sozinhos e checam a
   flag antes de gravar.
5. **Concorrência 3 e retry 3x com backoff continuam.** Uma rajada de 10 fotos enfileira 10 e
   drena 3 por vez; nada é descartado.
6. **Falha nunca é silenciosa.** Hoje `uploadStatus: 'failed'` é gravado mas não aparece na UI —
   a Fase 5 passa a mostrar isso no `PhotoThumb` com reenvio.

---

## Fase 0 — Dependência nativa

```bash
npx expo install expo-camera
```

`app.json` → `plugins`, junto do bloco de `expo-image-picker` já existente:
```json
["expo-camera", {
  "cameraPermission": "Permita o acesso à câmera para fotografar a vistoria.",
  "recordAudioAndroid": false
}]
```

Depois: `npx expo prebuild --clean` e `bun ios` / `bun android`. `ios/` e `android/` são
gitignored/gerados, e o projeto já tem módulos nativos (`whisper-kit-expo`,
`expo-image-manipulator`), então o fluxo de prebuild já é o normal aqui.

**Ícones.** A registry (`src/components/Icon/registry.ts`, 30 ícones) já tem `camera`, `multiply`,
`check`, `plus`, `trash-2`, `repeat`, `chevron-left`. Faltam **flash** e **biblioteca de fotos**:
adicionar `zap.svg` e `image.svg` em `src/assets/icons/`, rodar `bun generate-icons` e registrar
em `registry.ts`. Se os SVGs não estiverem disponíveis, usar `repeat` para virar a câmera e
rótulos de texto curtos para flash/biblioteca — não bloquear nisso.

---

## Fase 1 — Convex: apagar os bytes

**`convex/files.ts`** — nova mutation para blobs órfãos (upload que terminou depois do delete):
```ts
export const remove = mutation({
  args: { storageId: v.string() },
  handler: async (ctx, { storageId }) => {
    try { await ctx.storage.delete(storageId as Id<'_storage'>) } catch { /* já removido */ }
    return null
  },
})
```

**`convex/applications.ts`** — nova `purgeAttachment`, ao lado de `setAttachmentDeletedAt`
(~linha 215), reusando o helper `getApp` que já existe (~linha 43):
```ts
export const purgeAttachment = mutation({
  args: {
    applicationId: v.string(),
    itemId: v.union(v.string(), v.null()),
    attachmentId: v.string(),
  },
  handler: async (ctx, { applicationId, itemId, attachmentId }) => {
    const application = await getApp(ctx, applicationId)
    if (!application) return null

    const source = itemId === null
      ? application.attachments
      : (application.items.find((item) => item.id === itemId)?.attachments ?? [])
    const target = source.find((attachment) => attachment.id === attachmentId)
    if (!target) return null

    if (target.storageId) {
      try { await ctx.storage.delete(target.storageId as Id<'_storage'>) } catch { /* já removido */ }
    }

    const drop = (list: PersistedAttachment[]) =>
      list.filter((attachment) => attachment.id !== attachmentId)

    if (itemId === null) {
      await ctx.db.patch(application._id, { attachments: drop(application.attachments) })
    } else {
      await ctx.db.patch(application._id, {
        items: application.items.map((item) =>
          item.id === itemId ? { ...item, attachments: drop(item.attachments) } : item,
        ),
      })
    }
    return null
  },
})
```
Isso faz **hard delete da linha** — o soft-delete continua sendo o passo 1 (feedback instantâneo
+ undo) e o purge é o passo 2 (commit). Não mexer em `updatedAt` aqui: purge é faxina, não edição
do usuário (mexer causaria re-render de listas por um evento que o usuário não provocou).

**Opcional, mesma sessão:** `applications.softDelete` também deixa blobs órfãos ao apagar a
aplicação inteira. Um loop de `ctx.storage.delete` sobre todos os `storageId` antes do patch
resolve — viável porque são dezenas de anexos por aplicação, não milhares.

---

## Fase 2 — Cancelamento no upload store

**`src/infra/uploads/upload-store.ts`** — hoje, se a foto for removida durante o upload, o
`processJob` termina e chama `setAttachmentUploaded` sobre uma linha que não existe mais
(no-op silencioso no servidor) deixando **o blob órfão**. Adicionar:

- `abandoned: Record<string, true>` no estado.
- `cancel(attachmentId)`: remove da `queue` e marca em `abandoned`. **Não** toca em
  `activeWorkers` nem em `inFlight` (invariante B.4).
- Em `processJob`, **depois** de obter `storageId` e **antes** de `setAttachmentUploaded`:
  se `abandoned[attachmentId]`, chamar `convexClient.mutation(api.files.remove, { storageId })`,
  limpar a flag e retornar sem gravar.
- `resumePending()` não precisa de mudança: `purgeAttachment` tira a linha do array, então a
  varredura simplesmente não a encontra mais.

Novo helper `deleteLocalUpload(localUri)` (em `src/infra/convex/photo-picker.ts`, junto de
`prepareAsset`): `FileSystem.deleteAsync(uri, { idempotent: true })` quando o uri estiver em
`${documentDirectory}uploads/`. Sem isso, os JPEGs preparados vazam no disco do dispositivo.

---

## Fase 3 — Pipeline de anexo compartilhado

Extrair o `uploadAsset` de `ApplicationFill` (`src/app/ApplicationFill/index.tsx:140-182`) para
um hook novo **`src/hooks/useAttachPhotos.ts`**, para que a tela de câmera e o fluxo de
biblioteca usem exatamente o mesmo caminho:

```ts
export function useAttachPhotos() {
  const mutations = useApplicationMutations()   // mantém o optimistic update (invariante A.1)

  // O id é gerado ANTES do prepare: a miniatura local e a linha do Convex são a mesma row.
  function beginAttachment(): string { return generateId('attachment_') }

  async function commitAsset(params: {
    attachmentId: string
    applicationId: string
    itemId: string | null
    uri: string
    width: number
    height: number
    position: number
    isCancelled?: () => boolean
  }) {
    const prepared = await prepareAsset(params)            // resize 1600 + JPEG 0.7 + copy p/ documentDirectory
    if (params.isCancelled?.()) { await deleteLocalUpload(prepared.uri); return }

    const attachment = createAttachment(
      { id: params.attachmentId, name: ..., localUri: prepared.uri,
        uploadStatus: 'pending', mimeType: 'image/jpeg', width: ..., height: ... },
      params.position,
      new Date().toISOString(),
    )

    // 1) linha otimista (aparece no frame seguinte, nos 3 caches)
    void mutations.addAttachment({ applicationId, itemId, attachment, updatedAt })
      .catch(onError)
    // 2) upload em background, SEM esperar o round-trip do passo 1
    useUploadStore.getState().enqueue({ applicationId, itemId, attachment })
  }

  return { beginAttachment, commitAsset }
}
```

Duas mudanças de comportamento em relação ao código atual:

1. **Enfileirar sem esperar o servidor.** Hoje o `enqueue` está no `.then()` do `addAttachment`
   (`:167`), ou seja, o upload só começa depois do round-trip. Como o Convex serializa as
   mutations do cliente na ordem de chamada (invariante A.10), `addAttachment` **sempre** chega
   antes do `setAttachmentUploaded` que o upload dispara no fim — dá para chamar os dois lado a
   lado com segurança. Ganho: o upload começa ~1 RTT mais cedo por foto.
2. **`isCancelled`** é checado logo após o `prepareAsset`: se o usuário removeu a miniatura
   enquanto a compressão rodava, apaga o arquivo preparado e nem cria a linha.

`prepareAsset` continua como está (resize 1600px / JPEG 0.7 / **cópia para
`documentDirectory/uploads/`** — invariante B.2) e passa a aceitar `{ uri, width, height }` em
vez do `ImagePickerAsset` inteiro, para servir também o `CameraCapturedPicture` do `expo-camera`.
`pickPhotos` fica só com o caminho `'library'` — o `'camera'` sai junto com o `Alert`.

---

## Fase 4 — Tela de captura contínua (`src/app/PhotoCapture/`)

Nova rota no stack (`src/routes/types.ts`, `src/routes/StackRoutes.tsx`):
```ts
photoCapture: { applicationId: string; itemId: string | null }
```
apresentada como `presentation: 'fullScreenModal'`, `animation: 'slide_from_bottom'`,
`headerShown: false`. Adicionar o path em `src/routes/linking.ts` junto dos demais.

**Layout** (fundo preto, `useSafeAreaInsets`):

```
┌──────────────────────────────┐
│ ✕            ⚡ auto      ⟳   │  ← topo: fechar / flash / virar câmera
│                              │
│        <CameraView>          │
│                              │
│ ┌──┐┌──┐┌──┐┌──┐             │  ← filmstrip horizontal das fotos da sessão
│ └──┘└──┘└──┘└──┘             │
│  🖼        (  ●  )   Concluir 4│  ← biblioteca / obturador / concluir (N)
└──────────────────────────────┘
```

**Componentes-chave:**
- `useCameraPermissions()` do `expo-camera`; se negado, tela de fallback com botão
  "Abrir ajustes" (`Linking.openSettings()`).
- `<CameraView ref={cameraRef} facing={facing} flash={flash} animateShutter={false}
  onCameraReady={() => setReady(true)} style={StyleSheet.absoluteFill} />`.
  `animateShutter={false}` tira a animação embutida; o feedback vem de `haptics`
  (`src/utils/haptics.ts`, já usado no projeto) + a miniatura aparecendo no filmstrip.
- Obturador desabilitado até `ready`.

**Disparo (não bloqueante — é isso que dá a sensação do WhatsApp):**
```ts
async function handleShutter() {
  if (!ready || !cameraRef.current) return
  const photo = await cameraRef.current.takePictureAsync({
    quality: 0.9, skipProcessing: true, exif: false, // skipProcessing corta bastante no Android
  })
  if (!photo) return
  haptics.impact()

  const attachmentId = beginAttachment()
  setStrip((current) => [...current, { id: attachmentId, uri: photo.uri }]) // miniatura JÁ
  void commitAsset({ attachmentId, ..., isCancelled: () => cancelled.current.has(attachmentId) })
    .catch(() => markFailed(attachmentId))
}
```
O `commitAsset` (prepare + compressão + mutation otimista + enqueue) roda em background; o
obturador volta a aceitar toque no frame seguinte. O filmstrip renderiza do `useState` local com
o uri cru da câmera — nada depende de query nem de rede (exceção documentada em A.6).

**Demais ações da tela:**
- **🖼 biblioteca** → `pickPhotos('library')` (multi-seleção, já configurado) → um `commitAsset`
  por asset, alimentando o mesmo filmstrip.
- **Tocar numa miniatura** → abre o `PhotoViewer` (Fase 5) sobre as fotos da sessão, com deletar.
- **Remover do filmstrip** → `cancelled.current.add(id)`; se já commitou, dispara o mesmo fluxo
  de delete+purge da Fase 6.
- **Concluir (N)** → `navigation.goBack()`. Não espera nada: as mutations e os uploads já estão
  em voo e sobrevivem ao unmount (invariantes A.8 e B.1).
- **✕** com N > 0 → `ConfirmBottomSheet` ("Descartar N fotos?"). As fotos já commitadas não são
  descartadas de verdade; o botão só existe para sair sem passar pelo "Concluir".

`position` do anexo: contagem atual lida de `useQuery(api.applications.findById, { id })`
(`application.attachments.length` ou a do item) **no momento do disparo**, + o índice dentro do
filmstrip — evita colisão entre fotos tiradas em rajada.

---

## Fase 5 — Visualizador em tela cheia (`src/components/PhotoViewer/`)

Novo componente, exportado por `src/components/index.ts`:
```ts
interface PhotoViewerProps {
  visible: boolean
  photos: { id: string; uri?: string; uploading?: boolean; progress?: number }[]
  initialIndex: number
  onClose: () => void
  onDelete?: (id: string) => void
}
```
- RN `Modal` (`animationType="fade"`, `statusBarTranslucent`), fundo preto.
- `FlatList` horizontal com `pagingEnabled` + `getItemLayout` (para `initialScrollIndex` pular
  direto para `initialIndex` sem animar) e `windowSize={3}`.
- Cada página: `expo-image` com `contentFit="contain"`, `recyclingKey={id}`, `transition={0}`,
  dentro de um `GestureDetector` com `Gesture.Pinch()` + `Gesture.Pan()` (pan só quando
  `scale > 1`) e duplo-toque alternando 1x/2x, via `react-native-reanimated` — ambos já
  instalados, nenhuma dependência nova.
- Overlay: `multiply` (fechar) à esquerda, `"{i} de {N}"` no centro, `trash-2` à direita.
  Deletar chama `onDelete(id)` e avança para a próxima (ou fecha se era a última).
- Fotos com `uploading` mostram o `ProgressBar` existente sobre a imagem local — o mesmo
  `useUploadStore().progress` da miniatura.

**`src/components/PhotoThumb/index.tsx`** — adicionar:
- `onPress?: () => void` → envolver a `<Image>` num `Pressable` (`accessibilityLabel="Ver foto"`).
- Estado `failed`: quando `uploadStatus === 'failed'`, borda `colors.danger.base` + badge de
  reenvio chamando `useUploadStore().enqueue` de novo (invariante B.6). Hoje esse estado é
  gravado no Convex mas não aparece em lugar nenhum na UI.

**Onde o viewer vive.** O estado (`viewerPhotos`, `viewerIndex`) fica em `ApplicationFill` e o
`<PhotoViewer />` é renderizado como **irmão** do `ItemDrawer`, não dentro dele — um `Modal` RN
dentro de um bottom sheet do gorhom é fonte conhecida de problema. O `ItemDrawer` recebe
`onOpenPhoto: (index: number) => void` e só propaga o toque.

---

## Fase 6 — Remoção real (soft-delete → undo → purge)

Em `ApplicationFill`, `handleRemoveAttachment` (`:209`) e `handleRemoveApplicationAttachment`
(`:238`) hoje passam `onCommit: () => undefined`. O `UndoToastProvider`
(`src/components/UndoToast/index.tsx`) já dispara `onCommit` quando a janela de 5s expira,
quando outro toast o substitui **e no unmount** — exatamente o gancho que falta:

```ts
function removeAttachment(itemId: string | null, attachment: Attachment) {
  const deletedAt = new Date().toISOString()
  // passo 1: some da tela no frame seguinte (optimistic, nos 3 caches)
  void mutations.setAttachmentDeletedAt({
    applicationId: application.id, itemId, attachmentId: attachment.id,
    deletedAt, updatedAt: deletedAt,
  }).catch(() => setApplicationError('Não foi possível remover a foto'))

  showUndo({
    message: 'Foto removida',
    onUndo: () => { /* setAttachmentDeletedAt(..., deletedAt: null) — como hoje */ },
    onCommit: () => {                       // passo 2: só depois dos 5s
      useUploadStore.getState().cancel(attachment.id)
      void deleteLocalUpload(attachment.localUri)
      void mutations.purgeAttachment({
        applicationId: application.id, itemId, attachmentId: attachment.id,
      }).catch(() => undefined)
    },
  })
}
```
As duas funções viram uma só parametrizada por `itemId: string | null` (a diferença entre elas
hoje é literalmente esse argumento).

**`src/hooks/useApplicationMutations.ts`** — adicionar `purgeAttachment` com optimistic update
removendo a entrada dos arrays, reusando o `patchAppEverywhere` (`:18`) — invariante A.2. Sem
isso os caches `listAll` / `listByChecklistId` seguem com a linha até o servidor responder.
Falhar o purge é aceitável: a linha continua com `deletedAt` e some da UI de qualquer jeito.

---

## Fase 7 — Limpezas no que já existe

- **`ItemDrawer`**: hoje filtra `uploadStatus !== 'pending'` de `activeAttachments` e renderiza
  os pendentes por um prop separado `pendingPhotos` (`:61-63`, `:174-181`), o que faz a foto
  "pular" de lista quando o upload termina. Unificar com o padrão da galeria da aplicação —
  uma lista só, `uri={attachment.url ?? attachment.localUri}`,
  `uploading={attachment.uploadStatus === 'pending'}` — e remover o prop `pendingPhotos`
  (`ApplicationFill:721-727` sai junto).
- **`ApplicationFill`**: `choosePhoto` / `attachPhotos` / o `Alert.alert` (`:184-207`) saem.
  `handleAddApplicationPhoto` → `navigation.navigate('photoCapture', { applicationId, itemId: null })`,
  `handleAddPhoto(itemId)` → idem com `itemId`. Antes de navegar a partir do `ItemDrawer`,
  fechar o sheet (`setEditingItemId(null)` após salvar o draft) para não voltar com ele aberto
  por cima da tela.
- **Opcional (polimento de latência):** buscar `api.files.generateUploadUrl` em paralelo com o
  `prepareAsset` e passar a URL pronta para `uploadImage` (parâmetro opcional novo). A URL vale
  1 hora; a compressão leva 200-500ms, que é mais que o RTT — some o round-trip inteiro do
  caminho crítico. Está descrito na Fase 4 do plano original e nunca foi feito.
- **Opcional (higiene de disco):** varredura no boot apagando arquivos de
  `documentDirectory/uploads/` com mais de N dias que não são referenciados por nenhum
  `localUri` — cobre o caso de app morto entre `takePictureAsync` e `addAttachment`.

---

## Arquivos

**Novos**
- `src/app/PhotoCapture/index.tsx`, `src/app/PhotoCapture/styles.ts`
- `src/components/PhotoViewer/index.tsx`, `src/components/PhotoViewer/styles.ts`
- `src/hooks/useAttachPhotos.ts`

**Modificados**
- `convex/files.ts` (+`remove`), `convex/applications.ts` (+`purgeAttachment`)
- `src/hooks/useApplicationMutations.ts` (+`purgeAttachment` otimista via `patchAppEverywhere`)
- `src/infra/uploads/upload-store.ts` (+`cancel` / `abandoned` / limpeza de blob órfão)
- `src/infra/convex/photo-picker.ts` (`prepareAsset` genérico, `deleteLocalUpload`, `pickPhotos` só library)
- `src/app/ApplicationFill/index.tsx` (navegação para captura, viewer, purge no `onCommit`)
- `src/components/PhotoThumb/index.tsx` (+`onPress`, estado `failed` com reenvio)
- `src/components/ItemDrawer/index.tsx` (lista única de fotos, `onOpenPhoto`)
- `src/routes/types.ts`, `src/routes/StackRoutes.tsx`, `src/routes/linking.ts`
- `src/components/index.ts` (export `PhotoViewer`)
- `app.json`, `package.json`, `src/components/Icon/registry.ts`

**Não tocar:** `src/hooks/useApplicationFill.ts` (invariante A.7), `App.tsx` (o
`subscribeToUploadRecovery` e o `ConvexQueryCacheProvider` já estão certos),
`src/infra/convex/normalize.ts`.

Padrões a seguir: `StyleSheet.create` em `styles.ts` colocado, tokens de `src/styles/`
(`colors`, `space`, `radius`, `touch`, `textStyles`) — nada hardcoded; `Screen` **não** é usado
na PhotoCapture (é tela cheia preta sem chrome).

---

## Verificação

Pré-requisitos: `npx expo prebuild --clean` + `bun ios` (device físico — o simulador não tem
câmera real e esconde latência de rede), `npx convex dev` rodando.

1. `bun typecheck` e `bun lint` limpos.
2. **Velocidade da câmera:** abrir a galeria da aplicação → "Adicionar". A tela deve subir com
   preview ao vivo em bem menos que o `launchCameraAsync` de hoje. Cronometrar os dois.
3. **Captura contínua:** disparar 8 fotos em rajada. Cada miniatura aparece no filmstrip
   imediatamente, o obturador nunca trava, o contador do "Concluir" acompanha, e a **ordem** das
   8 no filmstrip é a ordem dos disparos. "Concluir" → volta para a galeria já com as 8
   (algumas ainda com overlay de progresso).
4. **Upload em background:** durante a rajada, o dashboard do Convex mostra `setAttachmentUploaded`
   chegando enquanto ainda se fotografa. Navegar para fora no meio → voltar → fotos lá.
   **Force-quit no meio → relançar** → `resumePending` retoma e conclui.
5. **Optimistic updates, o teste central:** Network Link Conditioner em "3G".
   - Tirar uma foto → a miniatura aparece **no frame seguinte**, sem spinner de tela.
   - Remover uma foto → some na hora; "Desfazer" traz de volta na hora. Nenhum dos dois espera rede.
   - Com a mesma aplicação visível em outra tela (Library / Overview / ChecklistDetail), o
     contador de fotos acompanha sem round-trip — é isso que prova que `patchAppEverywhere`
     alcançou `listAll` e `listByChecklistId`, não só `findById`.
   - Tocar em chips de resposta rapidamente continua instantâneo (regressão da Fase 2/3 anterior).
6. **Preview:** tocar numa miniatura abre em tela cheia no índice certo; arrastar navega entre
   as fotos; pinça dá zoom; "{i} de {N}" bate. Funciona igual na galeria e dentro do ItemDrawer.
7. **Purge:** anotar o `storageId` de uma foto (dashboard → Data → applications). Remover a
   foto, **não** tocar em "Desfazer", esperar 5s. Dashboard → Files: o blob some; o anexo some
   do array do documento. Repetir tocando em "Desfazer" antes dos 5s → a foto volta e o blob
   **continua lá**.
8. **Purge durante upload (o caso de corrida):** tirar uma foto e removê-la enquanto o overlay
   de progresso ainda está visível. Após os 5s, conferir em Files que **nenhum** blob novo
   ficou para trás.
9. **Disco local:** após purgar, o JPEG correspondente em `documentDirectory/uploads/` não
   existe mais.
10. **Permissão negada:** revogar acesso à câmera nos ajustes do iOS → a tela mostra o fallback
    com "Abrir ajustes", sem crash.
11. **Falha de upload:** modo avião, tirar uma foto, esperar os 3 retries → a miniatura fica em
    estado `failed` com reenvio; religar a rede e tocar em reenviar → completa.

## Referências

- [expo-camera (SDK 57)](https://docs.expo.dev/versions/latest/sdk/camera/) — `CameraView`,
  `useCameraPermissions`, `takePictureAsync({ skipProcessing })`, `animateShutter`
- [Convex — Deleting files](https://docs.convex.dev/file-storage/delete-files) (`ctx.storage.delete`)
- [Convex — Optimistic Updates](https://docs.convex.dev/client/react/optimistic-updates)
- `plan/optimistic-updates-background-uploads.md` — Fases 3 e 4 (optimistic updates + upload
  store) já entregues; este plano estende as duas e fecha as pontas soltas (cancelamento de
  upload, estado `failed` visível, purge do storage, URL pré-buscada)
