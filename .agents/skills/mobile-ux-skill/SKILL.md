---
name: mobile-ux
description: Padrões de UX e interação para o nosso app React Native — search como botão falso, row-resumo + bottom sheet de seleção, gestão de teclado com @gorhom/bottom-sheet, swipe actions, undo em snackbar, atalhos de data, haptics e estados de tela. Use este skill SEMPRE que a tarefa envolver construir, revisar ou refatorar qualquer tela, formulário, campo de entrada, lista, modal ou bottom sheet em React Native — mesmo que o pedido seja só "cria uma tela de X" ou "adiciona um campo Y" e não mencione UX explicitamente. Também use quando alguém perguntar onde colocar um input, se algo deve ser sheet ou tela cheia, ou como deixar uma interação "mais nativa".
---

# UX Mobile — padrões do app

Este skill existe porque decisões de interação no mobile se repetem, e quando cada tela resolve do seu jeito o app fica inconsistente de um jeito que o usuário sente mas não sabe nomear. Aqui estão as decisões já tomadas.

Stack assumida: React Native + `@gorhom/bottom-sheet` + `StyleSheet`. Não temos design system, então a seção **Constantes** abaixo é o substituto mínimo — use ela em vez de inventar números.

## O princípio que explica quase tudo

Duas restrições mandam no mobile:

1. **O polegar alcança a parte de baixo da tela.** O topo é caro. Ações primárias, seleções e confirmações ficam embaixo.
2. **Teclado é o inimigo.** Ele come metade da tela, esconde contexto e é lento de digitar. Todo input de texto que você conseguir transformar em seleção é uma vitória.

Quase todo padrão daqui pra baixo é consequência de um desses dois.

## Constantes

Sempre importe daqui. Se o valor que você quer não existe, adicione ao arquivo em vez de escrever inline — inline é como a inconsistência entra.

```ts
// src/ui/tokens.ts
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, sheet: 24 } as const;

// Alvo mínimo de toque: 44pt (iOS HIG) / 48dp (Material). Usamos 48.
export const touch = { min: 48 } as const;

// Durações. Acima de ~300ms a animação começa a parecer lenta.
export const duration = { fast: 150, base: 220, sheet: 300 } as const;
```

**Alvo de toque:** qualquer elemento tocável precisa de 48×48 de área real. Se o visual é menor (um ícone de 20px, um "x" de fechar), não aumente o desenho — use `hitSlop`:

```tsx
<Pressable hitSlop={14} onPress={onClose}>
  <CloseIcon size={20} />
</Pressable>
```

## Antes de escolher componente: reduza o formulário

A NN/g resume isso como **EAS — Eliminar, Automatizar, Simplificar**, nessa ordem. Cada campo a mais aumenta a chance de abandono, então a pergunta certa não é "qual componente uso pra esse campo" e sim "esse campo precisa existir":

1. **Eliminar** — dá pra não perguntar? Tem default razoável? Dá pra perguntar depois, na edição?
2. **Automatizar** — dá pra derivar de outra coisa? CEP preenchendo cidade/estado, GPS preenchendo local, câmera lendo código, data de hoje como padrão.
3. **Simplificar** — o que sobrou vira seleção em vez de digitação, com teclado certo e autofill.

### Regras de campo

Quando digitar é inevitável:

- **Teclado certo por campo.** `keyboardType="email-address"`, `"numeric"`, `"phone-pad"`. Obrigar o usuário a trocar de teclado manualmente é custo puro.
- **Autofill ligado.** `textContentType` (iOS) + `autoComplete` (Android) em nome, e-mail, telefone, endereço, OTP. Sem isso o preenchimento automático do sistema simplesmente não aparece.
- **Placeholder não substitui rótulo.** Placeholder some quando o usuário digita — aí ele perde a referência do que aquele campo era e não consegue revisar antes de enviar. Rótulo fica fora e acima do campo, sempre. (Exceção legítima: campo de busca, onde o contexto é óbvio e não há revisão.)
- **Não fatie campos.** Telefone, data e cartão em um campo só, com máscara. Três caixinhas forçam saltos de foco e validação mais frágil.
- **Uma coluna.** Nada de dois campos lado a lado, exceto pares curtos e logicamente ligados.
- **Erro preserva o que foi digitado** e explica o problema em texto — nunca só a borda vermelha. Cor sozinha não comunica para quem não distingue cor.

## Padrão 1 — Search como botão falso

O que parece um campo de busca na tela principal **não é um campo**. É um `Pressable` com aparência de input. Tocar nele entra em modo busca: a tela troca, o input real monta com foco, o teclado sobe e sugestões/histórico ocupam o lugar do conteúdo.

Por que: um `TextInput` montado na home custa foco acidental, re-render a cada tecla e um estado de "meio buscando" que ninguém pediu. E a troca de tela dá ao usuário um sinal claro de que ele mudou de contexto — com caminho de volta óbvio.

```tsx
// Na home — parece input, é botão
<Pressable
  style={styles.fakeInput}
  onPress={() => navigation.navigate('Search')}
  accessibilityRole="search"
  accessibilityLabel="Buscar"
>
  <SearchIcon size={18} color={colors.textMuted} />
  <Text style={styles.fakeInputPlaceholder}>Buscar</Text>
</Pressable>
```

**Armadilha do autoFocus:** no Android, `autoFocus` durante uma transição de tela costuma ser engolido — a tela aparece sem teclado. Foque depois que a animação terminar. O componente pronto está em `references/snippets.md` (`SearchScreen`).

Regra de saída: o botão de voltar do modo busca limpa a busca e volta. Não deixe o usuário preso num estado de resultado vazio sem saída.

## Padrão 2 — Row-resumo + sheet de seleção

Em formulário, a linha **não é um controle**. Ela mostra rótulo e valor atual. Tocar abre um sheet com as opções.

```
┌─────────────────────────────┐
│  Prioridade          Alta  ›│   ← row: só leitura
└─────────────────────────────┘
         ↓ tap
   sheet com as opções
```

Por que: o formulário inteiro vira uma lista legível e escaneável, em vez de uma parede de campos concorrendo por espaço vertical. E cada seleção acontece com o polegar, embaixo.

Regras de fechamento — essa distinção importa e quase sempre é feita errado:

- **Seleção única:** aplica e fecha sozinho. Sem botão de confirmar. O tap já é a confirmação; pedir um segundo toque é imposto de burocracia.
- **Seleção múltipla:** mantém aberto, mostra o que está marcado, fecha no botão "Concluído".
- **Destrutivo ou caro** (apagar, enviar, pagar): sempre exige confirmação explícita, mesmo em seleção única.

**Fechar não é cancelar.** Num sheet de seleção múltipla ou de filtros, o usuário pode arrastar pra baixo e fechar sem tocar em "Concluído" — e aí não existe resposta óbvia sobre o que deve acontecer com o que ele marcou. A NN/g identifica isso como problema recorrente em tela de filtro no mobile, justamente porque a tela ocupa tudo e não dá pra ver se as seleções valeram ou não. Decisão nossa, para não ficar ambíguo:

- **Filtro e seleção múltipla:** aplicar no dismiss, não descartar. Quem marcou três coisas e arrastou pra baixo quis marcar as três, não jogá-las fora.
- **Se descartar for inevitável** (formulário dentro do sheet, por exemplo), pergunte antes de fechar quando houver alteração pendente. Nunca descarte trabalho em silêncio.

Componentes `SelectRow`, `SelectSheet` e `MultiSelectSheet` estão em `references/snippets.md`.

## Padrão 3 — Sheet com teclado (a parte que quebra)

Sheet + `TextInput` é a fonte clássica de bug: o sheet sobe, o teclado sobe por cima, a altura não recalcula e o campo fica escondido atrás do teclado. Configuração que resolve:

```tsx
import BottomSheet, { BottomSheetTextInput, BottomSheetView } from '@gorhom/bottom-sheet';

<BottomSheet
  ref={sheetRef}
  enableDynamicSizing            // altura segue o conteúdo
  enablePanDownToClose
  keyboardBehavior="interactive" // iOS: sheet acompanha o teclado
  keyboardBlurBehavior="restore" // volta ao snap point ao fechar o teclado
  android_keyboardInputMode="adjustResize"
  backdropComponent={renderBackdrop}
>
  <BottomSheetView style={styles.sheetContent}>
    <BottomSheetTextInput style={styles.input} placeholder="Título" />
  </BottomSheetView>
</BottomSheet>
```

Pontos que não são opcionais:

- **`BottomSheetTextInput`, nunca `TextInput` puro** dentro do sheet. O componente da lib coordena foco e gesto de pan; o puro não.
- **Listas roláveis** dentro do sheet usam `BottomSheetFlatList` / `BottomSheetScrollView`. Um `FlatList` normal briga com o gesto de arrastar o sheet e o scroll trava.
- **`BottomSheetModalProvider` na raiz do app**, uma vez só.
- **Backdrop sempre.** Sheet sem fundo escurecido não comunica que é modal e o usuário tenta tocar no conteúdo atrás. Use `BottomSheetBackdrop` com `pressBehavior="close"`.
- **Input customizado precisa de trabalho manual.** Se você envolver o `TextInput` num componente próprio, tem que copiar o `handleOnFocus`/`handleOnBlur` do `BottomSheetTextInput` — é assim que a lib sabe que o teclado vai aparecer. Sem isso o sheet não reage.
- **`enableBlurKeyboardOnGesture`** (v5) fecha o teclado quando o usuário começa a arrastar o sheet. Sem ele, arrastar com teclado aberto produz um estado visual estranho no meio do caminho.

**Limitação conhecida, não é culpa sua:** no Android, com conteúdo em `BottomSheetScrollView` e um input perto do fim, o campo ainda pode ficar atrás do teclado mesmo com toda a configuração correta. É bug aberto na lib há várias versões. Se a tela tem vários campos, esse é mais um motivo pra ir de tela cheia em vez de sheet — veja o Padrão 4.

## Padrão 4 — Sheet vs tela cheia

Decidir por número de campos, não por gosto:

| Situação | Onde |
|---|---|
| Seleção de opções, filtros, 1–2 campos curtos | Bottom sheet |
| Formulário com 3+ campos, ou qualquer texto longo | Tela cheia (push ou modal) |
| Confirmação, ou um único campo trivial | Alert/dialog |
| Data, hora, lista longa nativa | Picker nativo |

Sheet com formulário grande + teclado é o cenário que sempre vira gambiarra de altura. Quando estiver em dúvida entre sheet e tela cheia com 3 campos, vá de tela cheia.

**Altura inicial: no máximo 50% da tela.** É a regra do Material 3 para sheet modal, e a razão é prática — a metade de cima precisa continuar visível para o usuário manter o contexto do que estava fazendo. Se o conteúdo não cabe em 50%, ele pode expandir arrastando; mas se ele *nunca* coube, o componente errado é o sheet.

**Arrastar não pode ser o único jeito de expandir.** Leitor de tela não arrasta. Use o drag handle padrão (no Android o `BottomSheetDragHandleView` já responde a comandos do TalkBack) e garanta que expandir/fechar também esteja disponível por toque — handle tocável, botão de fechar, ou ação explícita.

## Padrão 5 — Quick-add

Criação rápida não abre formulário. Abre um sheet com um campo de texto focado e uma fileira de ações rápidas (data, prioridade, projeto) logo acima do teclado. O usuário digita o título e dá enter; o resto tem default.

O ponto: criar deve custar um toque e uma frase. Detalhamento é opcional e acontece depois, editando. Se a criação exige preencher cinco campos, as pessoas param de criar.

Se houver parsing de linguagem natural ("amanhã 15h"), mostre o que foi interpretado como chip destacado dentro do próprio campo, para o usuário poder corrigir antes de salvar. Parsing invisível que erra silenciosamente é pior do que não ter parsing.

## Padrão 6 — Undo no lugar de confirmação

Para ações reversíveis (completar, arquivar, apagar item comum), **não pergunte**. Execute, remova da lista na hora e mostre um snackbar com "Desfazer" por ~5 segundos.

```
[✓ Tarefa concluída]              [Desfazer]
```

Por que: dialog de confirmação cobra o preço de todo mundo pra proteger o erro raro. Undo cobra só de quem errou. Dialog fica reservado para o que é irreversível de verdade.

Implementação: remova do estado local imediatamente (otimista) e agende a chamada de rede para depois da janela de undo — assim "desfazer" é só cancelar o timer, sem round-trip.

### Quando o dialog é obrigatório — e como escrever

Dialog fica para o que é irreversível de verdade ou caro de verdade: apagar conta, apagar projeto com o conteúdo dentro, pagar, enviar algo que não volta. Nesses casos:

- **Título nomeia o alvo.** "Apagar o projeto 'Onboarding'?" — não "Tem certeza?". Pergunta genérica não informa nada, e a única reação sensata a "tem certeza?" é sim, eu acabei de pedir.
- **Botão descreve a ação.** "Apagar projeto" / "Cancelar" — nunca "Sim" / "Não". O usuário lê o botão, não o texto.
- **Diga o que se perde**, com número quando houver: "18 tarefas serão apagadas junto."
- **Não encoste o destrutivo no benigno.** Botão de apagar colado no de salvar, com o mesmo peso visual, é erro de UI clássico. Separe e diferencie.

E a razão de tudo isso ser exceção: dialog demais causa habituação. Se o app pergunta o tempo todo, o usuário aprende a confirmar no automático — e aí o dialog que realmente importava também passa batido. Cada confirmação rotineira que você remove aumenta o poder das que sobraram.

## Padrão 7 — Swipe actions

Swipe na row para ações frequentes, com cor e ícone aparecendo conforme o dedo arrasta:

- **Curto** (revela botão): ações secundárias, o usuário escolhe.
- **Longo / até o fim** (dispara direto): a ação primária daquela lista — tipicamente completar ou arquivar.

Toda ação de swipe precisa ter um caminho equivalente sem swipe (menu de contexto no long-press, ou botão dentro do detalhe). Swipe é invisível — nunca pode ser o único jeito de fazer algo.

## Padrão 8 — Data com atalhos antes do calendário

Nunca abra direto no calendário. O sheet de data mostra primeiro os atalhos, e o calendário fica abaixo ou atrás de um "Escolher data":

```
Hoje            Amanhã         Próx. semana
Fim de semana                  Sem data
─────────────────────────────────────────
              [ calendário ]
```

A esmagadora maioria das seleções de data é "hoje" ou "amanhã". Fazer o usuário navegar um grid mensal para isso é cobrar caro pelo caso comum.

## Padrão 9 — Haptics

Feedback tátil marca que algo aconteceu, sem ocupar tela. Use `expo-haptics` com parcimônia — haptic em tudo vira ruído e o usuário desliga.

| Evento | Feedback |
|---|---|
| Selecionar opção no sheet | `selectionAsync()` |
| Completar tarefa | `notificationAsync(Success)` |
| Swipe atingiu o limiar de disparo | `impactAsync(Medium)` |
| Erro de validação | `notificationAsync(Error)` |
| Long-press iniciou drag | `impactAsync(Light)` |

Nunca em scroll, nem em navegação comum, nem em cada tecla.

## Padrão 10 — Estados de tela

Toda tela que carrega dados tem quatro estados, e os quatro são trabalho de UI:

- **Loading:** skeleton com o formato do conteúdo real. Mas atenção ao critério, porque a evidência aqui é mais fraca do que a internet sugere: existe estudo mostrando skeleton ganhando de spinner em velocidade percebida, e existe estudo (Viget, 136 pessoas) em que o skeleton perdeu para spinner *e* para tela em branco nos três indicadores. O que sustenta a escolha não é a percepção de velocidade — é **estabilidade de layout**: o skeleton reserva o espaço exato, então o conteúdo não empurra a tela quando chega. Por isso a regra é skeleton *que espelha o layout final*. Skeleton genérico de retângulos cinza que não tem nada a ver com o resultado é decoração, e aí spinner serve igual. Abaixo de ~300ms não mostre nada: o flash de skeleton seguido de conteúdo incomoda mais do que a espera.
- **Vazio:** explique o que aparece ali e dê a ação para preencher. "Nenhum item" sozinho é um beco sem saída.
- **Erro:** diga o que falhou em linguagem humana e ofereça "Tentar de novo". Nunca mostre código de erro cru.
- **Sucesso:** o conteúdo.

Para mutações, prefira UI otimista: atualize a tela na hora, reverta se a rede falhar. Esperar o servidor para mudar um checkbox faz o app parecer quebrado em conexão ruim.

## Checklist antes de abrir PR

- [ ] Todo tocável tem 48×48 de área (com `hitSlop` se preciso)
- [ ] Ações primárias no alcance do polegar
- [ ] Nenhum `TextInput` puro dentro de sheet
- [ ] Lista dentro de sheet usa `BottomSheetFlatList`/`ScrollView`
- [ ] Sheet tem backdrop e fecha no pan down
- [ ] Sheet de seleção única fecha ao escolher
- [ ] Ação reversível usa undo, não dialog
- [ ] Toda ação de swipe tem alternativa visível
- [ ] Os quatro estados de tela existem
- [ ] Números vêm de `tokens.ts`, não inline
- [ ] Testado com teclado aberto no Android e no iOS
- [ ] Sheet abre em no máximo 50% da tela
- [ ] Sheet expande/fecha sem depender de arrastar (leitor de tela)
- [ ] Filtro/multi-select aplica ao fechar, não descarta
- [ ] Todo campo tem rótulo fora dele, não só placeholder
- [ ] `keyboardType` e autofill configurados por campo
- [ ] Dialog de confirmação nomeia o alvo e o botão descreve a ação
- [ ] Skeleton espelha o layout final (ou não é skeleton)

## Fontes

As regras acima vêm de:

- **Material Design 3** — tipos de bottom sheet, limite de 50% de altura inicial, acessibilidade do drag handle
- **Apple HIG** — sheets para tarefa de escopo fechado ligada ao contexto atual; detents
- **Nielsen Norman Group** — framework EAS para formulários, checklist de campos no mobile, placeholder prejudicial, dialog de confirmação e habituação, fechar vs cancelar em filtros no mobile, proximidade entre ação destrutiva e benigna
- **Documentação do `@gorhom/bottom-sheet`** — props de teclado e a exigência do `BottomSheetTextInput`; issues abertas da lib para as limitações conhecidas no Android
- **Viget / LinkedIn** — evidência conflitante sobre skeleton vs spinner

Quando alguém questionar uma regra daqui, vale voltar à fonte em vez de discutir por preferência. E quando a fonte for ambígua — como no caso do skeleton — a regra registra a ambiguidade em vez de fingir que não existe.

## Código pronto

`references/snippets.md` tem os componentes completos para copiar: `SearchScreen` (com o fix de autoFocus), `SelectRow` + `SelectSheet` + `MultiSelectSheet`, `useBottomSheet`, `QuickAddSheet`, `UndoSnackbar` e `DatePickerSheet`. Leia esse arquivo quando for implementar qualquer um dos padrões acima em vez de escrever do zero.
