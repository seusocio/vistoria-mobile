# 0002 — Outbox × cascatas do servidor (notas, anexos, Visita apagada)

- Status: aceita
- Data: 2026-10-15
- Complementa: [0001](0001-offline-sync-resilience.md)

## Contexto

Em 14/10 entraram as Notas (`src/features/note`). No dia seguinte a barra ficou vermelha de
novo: ~60 ops presas atrás de um `applications.addAttachment` que recebia
`404 aplicação não encontrada`. Todas as regras da 0001 estavam sendo seguidas.

## Por que a 0001 não impediu

A 0001 escreve regras **por op**: "um delete trata 404 como feito". Ela supõe que o alvo de
uma op só some pelo próprio delete dela. As Notas trouxeram **cascatas no servidor**
(`vistoria-api/docs/adr/0001-notes-reference-attachments-by-id-array.md`):

| Escrita no servidor | Efeito colateral |
|---|---|
| `DELETE` nota | apaga os anexos que só ela usava |
| `DELETE` anexo | tira o id de toda nota e apaga a nota que ficou vazia |
| `DELETE` Visita | apaga de verdade a Visita, anexos e notas |
| `POST` nota | 422 se algum `attachmentId` não existe (só valida na primeira vez) |

Com isso, o alvo de uma op que **não** é delete passa a sumir por causa de *outra* op, ou de
outro aparelho:

1. `notes.patch` (transcrição) depois de apagar a nota → 404 → `failed` na cabeça.
2. `setAttachmentUploaded` depois que o delete da nota levou o anexo → 404 → `failed`.
3. A auto-cura do upload (0001, decisão 6) via o `presign` dar 404 e **recriava** o anexo
   apagado: a foto voltava órfã.
4. `notes.create` depois de um `deleteAttachment` de um anexo que ela cita → 422. A regra 7
   da 0001 ("a FIFO garante a ordem") falha aqui: o seletor da galeria só posta a nota
   depois que todas as fotos terminam de preparar, e uma foto apagada nesse meio-tempo
   entra na fila **antes** da nota que ainda a cita.
5. Visita apagada no servidor por outro caminho → toda op dela dá 404 para sempre. O
   "Como diagnosticar" da 0001 tratava Visita ausente como bug no `create` e nunca previu
   que ela pudesse ter sido apagada.

A decisão de fazer cascata foi tomada no repositório do backend. Nada obrigava a revisar
as ops do app contra ela.

## Decisões

| # | Decisão | Onde |
|---|---------|------|
| 1 | `notes.patch` e `setAttachmentUploaded` usam `treatNotFoundAsDone`: o alvo pode ter sido apagado por cascata. | `note.ops.ts`, `application.ops.ts` |
| 2 | Apagar uma nota cancela os uploads dos anexos dela. Um job `abandoned` nunca se auto-cura. | `note.actions.ts`, `upload-store.ts` |
| 3 | `createNoteRest`, ao receber 422 `anexo não encontrado nesta visita: …`, reenvia sem os ids ausentes. Se não sobra texto nem anexo, resolve sem criar (`null`), igual à cascata do servidor. | `note.rest.ts` |
| 4 | **Escopo:** toda op declara a que Visita pertence (`OpDefinition.scope`, por padrão `entityId`) e reconhece "a Visita sumiu" (`isScopeGone` → `isApplicationGone`). O drain então descarta **todas** as ops daquela Visita, avisa `onScopeGone` (a fila de uploads cancela os jobs dela) e segue. Se o `create` da Visita ainda está na fila, nada é descartado. | `offline-queue/ops.ts`, `drain.ts`, `application.rest.ts` |
| 5 | Cada op guarda o `lastError` (status, mensagem, corpo do servidor). O drain registra o que fez em `useDrainLog`. Um erro em `onServerResponse` não é mais tratado como falha de envio. | `queue.store.ts`, `drain-log.ts`, `drain.ts` |
| 6 | "Marcar upload como falho" checa a própria outbox, não só o `Set` da sessão, que zera a cada relançamento. | `upload-store.ts` |
| 7 | **Outbox debugger** na tela: outbox, fila de uploads, log do drain e cache de queries, com exportação em JSON. | `components/OutboxDebugger`, `FEATURE_FLAG.outboxDebugger` |

## Regras para novas ops (somam-se às da 0001)

8. **Para cada op, liste quem pode apagar o alvo**: o próprio delete, uma cascata do
   servidor, outro aparelho. Se o efeito da op perde o sentido sem o alvo, use
   `treatNotFoundAsDone`. Não basta perguntar "esta op é um delete?".
9. **Op que vive sob uma Visita declara `scope`** (quando `entityId` não é o id da Visita) e
   `isScopeGone: isApplicationGone`.
10. **Uma referência que o servidor valida (422) degrada como a cascata dele.** Se o servidor
    tiraria o id ausente num delete, a op tira o id ausente e reenvia.
11. **Mudou cascata ou validação no `vistoria-api`?** Revise cada op do app que toca as
    entidades afetadas usando as regras 8 a 10, no mesmo PR ou num PR casado.
12. **Apagar o dono cancela o trabalho fora da outbox** (uploads). Qualquer enfileiramento
    fora de banda, como a auto-cura, precisa saber que o dono foi apagado.

## Como diagnosticar

Toque na pílula sob a barra de status → **Outbox debugger**.

- Aba Outbox: a op marcada **BLOCKING** é a causa. O `lastError` traz o corpo do servidor.
- Aba Log: o que já saiu (`resolved`, `resolved-not-found`, `dropped-scope-gone`, …).
- Aba Uploads: `ops in outbox` mostra se a linha do anexo ainda está para subir.
- **Share JSON** exporta tudo para anexar num issue.

## Consequências

- O descarte por escopo apaga escritas. Se o 404 vier de **projeto errado** e não de Visita
  apagada, perde-se escrita real. Os `send` leem o projeto ativo na hora de drenar, não o da
  hora de enfileirar. Gravar `orgId`/`projectId` na op ao enfileirar fecha essa porta; ainda
  não foi feito.
- `isApplicationGone` e o retry de `createNoteRest` comparam **o texto do erro** do servidor
  (`aplicação não encontrada`, `anexo não encontrado nesta visita`). Se o texto mudar, o
  comportamento volta a ser o de travar a fila. Um `code` estável no corpo de erro do
  backend resolve isso.
- As regras ainda são prosa. Um teste que obrigue cada op a declarar o que faz num 404
  seria mais forte.
