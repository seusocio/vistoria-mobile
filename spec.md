
prototipos telas pencil mcp:
Node IDs: tyKQq, xSSgl, ArHxV, AS5Of, YennH, Yvmu4, aAL6u, dYgAG, pShSW

---
spec:
# Especificação do App de Vistoria (v2 — Tags Genéricas)

Este documento descreve o comportamento necessário para replicar o app de vistoria, com a generalização de unidade, torre e responsável em uma entidade única de **Tag**, sem tipo fixo, que sustenta relatórios de progresso e pendência por combinação de tags.

> Esta versão substitui o modelo anterior (campo fixo `unit`, ex. `APT31`/`APT01`). Não existe mais unidade como campo próprio — toda classificação (torre, unidade, responsável) é feita por `tagsIds` livres, conforme seção 2.

## 1. Escopo

O sistema permite:

- Criar e manter modelos de checklist.
- Reutilizar modelos em vistorias de unidades.
- Classificar checklists, itens de checklist, aplicações e itens de aplicação com **tags livres, reutilizáveis e sem tipo**, vindas de um catálogo único.
- Acompanhar aplicações por combinação de tags (torre, unidade, responsável, ou qualquer outra classificação que o usuário criar).
- Preencher cada item com resposta, observação, quantidade e foto.
- Preencher uma vistoria por voz e gerar sugestões para os itens (resposta e observação).
- Aceitar ou rejeitar sugestões individualmente ou em lote.
- Concluir uma vistoria e iniciar outra para a mesma unidade.
- Consultar relatórios dinâmicos de progresso e pendências, filtrando por qualquer combinação de tags.

## 2. Tags — Conceito Central

### 2.1 Definição

- Tag é uma **entidade única, sem tipo (`kind`)**, com significado dado inteiramente pelo texto que o usuário escolhe (ex.: "Torre A", "Apto 101", "Empreiteira X", "Vistoria de entrega").
- Existe **um catálogo global único** de tags, compartilhado entre todos os contextos de uso (checklist, item de checklist, aplicação, item de aplicação). Não há catálogos separados por contexto.
- Não há hierarquia formal entre tags (sem `parentTagId`). O cruzamento entre torre, apartamento e responsável é obtido combinando múltiplas tags na mesma aplicação/item, não por relação estrutural entre as tags.
- Se no futuro for necessário um agrupamento com múltiplos níveis que não caiba em "aplicar tags juntas" (ex.: torre → bloco → apto), isso deve ser tratado como uma extensão futura, fora desta versão.

### 2.2 Onde tags são usadas

Tags são adicionadas e selecionadas por um **combobox multiselect creatable** (permite escolher tags existentes ou criar uma nova digitando) nos seguintes pontos, todos com campo `tagsIds: string[]`:

1. **Checklist** (modelo) — classificação do modelo, ex.: "Vistoria de entrega".
2. **Item de checklist** (modelo) — ex.: responsável padrão esperado para aquele item.
3. **Aplicação** (vistoria de uma unidade) — ex.: torre, apartamento, empreiteiro responsável pela vistoria como um todo.
4. **Item de aplicação** — ex.: responsável específico por aquele item, quando diferente do responsável geral da aplicação.

A aplicação **não está restrita** às tags definidas no checklist-modelo: o usuário pode selecionar ou criar qualquer tag do catálogo global ao preencher uma aplicação ou um item de aplicação, independentemente do que o modelo define.

### 2.3 Regras de integridade

- O nome da tag é normalizado (trim + comparação case-insensitive) para evitar duplicatas no catálogo global (ex.: "Torre A" e "torre a" são a mesma tag).
- Tag não possui campo de cor ou ordem — são detalhes de UI fora do escopo desta especificação.
- Exclusão de tag é lógica (`deleted_at`), seguindo a mesma filosofia de RF-06/RNF-05 aplicada a checklist:
  - Referências existentes em `tagsIds` de checklists, itens, aplicações e itens de aplicação **permanecem intactas** — o dado histórico não é alterado.
  - Telas de seleção (combobox) e filtros de relatório deixam de oferecer a tag excluída como opção ativa.
  - Não há bloqueio de exclusão por tag em uso, nem limpeza em cascata das referências.
- Não existe, nesta versão, uma tela dedicada de administração do catálogo de tags (listar todas, editar, excluir manualmente). A gestão do catálogo é implícita: tags nascem pelo combobox creatable nos 4 pontos de uso listados em 2.2, e a exclusão lógica fica documentada como comportamento de dados, sem UI própria.

## 3. Requisitos Funcionais

### RF-01. Acessar a biblioteca de checklists

O usuário deve visualizar:

- Quantidade de modelos cadastrados.
- Quantidade total de aplicações.
- Quantidade de aplicações concluídas.
- Ação para continuar uma vistoria ou iniciar uma nova.
- Lista de modelos de checklist.

Cada modelo deve exibir nome, quantidade de itens, tags (`tagsIds` do checklist) e situação de rascunho.

### RF-02. Pesquisar e filtrar modelos

O usuário deve poder:

- Pesquisar por nome do checklist ou por tag.
- Filtrar por `Todos` ou por qualquer tag existente entre os checklists.
- Ver somente modelos não excluídos.

O filtro considera **apenas as tags do próprio checklist** (nível modelo). Tags atribuídas a itens do checklist não entram nesse filtro — este é escopo do relatório de aplicações (RF-15), não da biblioteca de modelos.

### RF-03. Criar checklist

O usuário deve poder criar um novo checklist informando:

- Nome do checklist.
- Tags (`tagsIds`), via combobox multiselect creatable, reutilizáveis e usáveis em qualquer lugar do catálogo global.
- Opções de resposta (ver seção 4 — Opções de Resposta).
- Itens do checklist, um item por linha, cada um podendo receber suas próprias tags (`tagsIds`) — ex.: responsável padrão esperado para aquele item.

O usuário deve poder iniciar a criação a partir dos modelos:

- `Vistoria de entrega`.
- `Áreas comuns`.
- `Instalação hidráulica`.

Ao selecionar um modelo, seus itens, título e tags correspondentes devem ser carregados para edição.

### RF-04. Editar checklist

O usuário deve poder alterar um checklist existente:

- Nome.
- Tags (`tagsIds`), incluindo adicionar novas via criação inline no combobox e remover tags existentes.
- Opções de resposta.
- Título, descrição, tags (`tagsIds`) e demais dados dos itens.
- Inclusão de novos itens.

Tags e opções devem ser adicionadas por entrada de texto e confirmação. Não devem ser adicionadas duplicatas de tags (normalização trim + case-insensitive) nem de opções.

### RF-05. Duplicar checklist

Ao duplicar um checklist:

- Deve ser criado um novo modelo.
- O nome deve receber o sufixo `(cópia)`.
- Os itens devem ser copiados com novos identificadores.
- As tags (`tagsIds`) do checklist e de cada item devem ser copiadas normalmente (referenciam as mesmas tags do catálogo global — copiar tags não cria tags novas).
- Respostas, observações, fotos, quantidades e sugestões dos itens copiados devem ser limpas.
- O novo modelo deve aparecer na biblioteca.

### RF-06. Excluir checklist

O usuário deve poder excluir um modelo da biblioteca. A exclusão deve ser lógica: o modelo não deve aparecer nas listagens, mas seu registro deve manter o estado de excluído.

### RF-07. Consultar aplicações de um checklist

Ao abrir um modelo, o usuário deve visualizar:

- Total de aplicações.
- Total de aplicações concluídas.
- Quantidade de itens por visita.
- Histórico das aplicações daquele modelo.
- Tags, status e quantidade de itens respondidos de cada aplicação.

Os status possíveis são `draft` e `completed`.

### RF-07.1. Agrupar histórico por unidade (accordion) e status de conformidade

O histórico do RF-07 não deve listar aplicações como linhas soltas e desconectadas quando elas se referem à mesma unidade. Aplicações que compartilham **exatamente o mesmo conjunto de `tagsIds`** (ex.: mesma torre + mesmo apartamento) devem ser agrupadas em uma única entrada expansível (accordion).

- **Colapsado**: mostra as tags do grupo e o status (`draft`/`completed`) da aplicação mais recente daquele grupo. Não repete `respondidos/total` no cabeçalho — esse detalhe fica na visão expandida.
- **Expandido**: lista cada aplicação do grupo, da mais recente para a mais antiga, mostrando a data da visita e uma **contagem de respostas negativas** daquela aplicação.
  - "Resposta negativa" é qualquer `item.answer` cuja opção correspondente no checklist tenha `semantic = negativo` (ver seção 4) — campo que já existe no modelo desde a v2, mas até esta correção nunca era consumido por nenhum requisito.
  - Essa contagem é **derivada em tempo de leitura** (cruza `items[].answer` com `checklist.options[].semantic`), não é um campo novo persistido, e não interfere no cálculo de `respondidos/total` (RF-10/RNF-07), que continua contando qualquer resposta preenchida independentemente do `semantic`.
- Aplicações com `deleted_at` preenchido não entram no agrupamento nem na contagem de negativas.
- O agrupamento é puramente de apresentação: `tagsIds` continua sem hierarquia (seção 2.1), e "unidade" nunca vira uma entidade própria no banco — é só a chave de agrupamento visual (mesmo conjunto exato de tags de aplicação).
- Ver RF-14.1 para a ação disponível a partir deste agrupamento.

### RF-08. Criar aplicação de checklist

O usuário deve informar:

- Uma ou mais tags (`tagsIds`), via combobox multiselect creatable — ex.: torre, apartamento, empreiteiro responsável. Qualquer tag do catálogo global pode ser usada, não apenas as tags do checklist-modelo.
- Data da visita.

Ao criar a aplicação:

- Os itens do modelo devem ser copiados para a aplicação.
- As tags de cada item do modelo (`tagsIds`) devem ser copiadas como valor inicial do item de aplicação correspondente (comportamento estrutural, editável depois — análogo a título/descrição do item).
- Cada item deve iniciar sem resposta, sem observação, sem quantidade, sem fotos e sem sugestão.
- A aplicação deve iniciar como rascunho (`draft`).
- O usuário deve ser levado à tela de preenchimento.

**Não existe valor padrão automático de tag.** A aplicação exige pelo menos 1 tag selecionada (ver RNF-06); não há fallback equivalente ao antigo `APT01`.

### RF-09. Abrir aplicação existente

O usuário deve poder abrir qualquer aplicação do histórico e continuar seu preenchimento.

Ao abrir uma aplicação, o preenchimento deve refletir os dados daquela aplicação (incluindo suas próprias `tagsIds`, no nível da aplicação e de cada item), e não os dados originais do modelo.

### RF-10. Preencher item do checklist

Cada item deve aceitar:

- Uma resposta, escolhida entre as opções configuradas no checklist (ver seção 4).
- Uma observação textual livre (`note`), sempre opcional e complementar — usada para detalhes que não estão contidos na própria opção de resposta escolhida.
- Uma ou mais fotos/anexos.
- Uma quantidade opcional.
- Tags (`tagsIds`), editáveis independentemente do que foi copiado do modelo — ex.: trocar o responsável daquele item específico.

Ao ativar quantidade, o usuário deve poder incrementar e decrementar o valor. O valor mínimo permitido é zero. Também deve ser possível remover o campo de quantidade.

O progresso da aplicação deve ser calculado pela quantidade de itens com resposta preenchida — **qualquer opção de resposta escolhida conta como "respondido"**, independentemente do seu significado (`semantic`, ver seção 4).

### RF-11. Adicionar fotos

O usuário deve poder adicionar fotos a cada item e visualizar a quantidade de fotos anexadas.

Cada anexo deve possuir identificador, nome, posição, data de criação e estado de exclusão lógica.

### RF-12. Preencher por voz

O usuário deve poder iniciar e encerrar uma gravação de vistoria.

Durante o fluxo, os estados apresentados são:

- Pronto para preencher por voz.
- Gravação em andamento.
- Processamento.
- Transcrição pronta.

Após o processamento, a aplicação deve exibir a transcrição e permitir sua expansão ou recolhimento.

### RF-13. Gerar sugestões a partir da transcrição

Com uma transcrição disponível, o usuário deve poder solicitar sugestões de preenchimento.

Cada sugestão pode preencher:

- Resposta do item.
- Observação do item, quando aplicável.

O fluxo de sugestão **não gera nem sugere tags** (`tagsIds`) em nenhum nível. Tags permanecem sempre preenchimento manual via combobox, mesmo em itens preenchidos por voz.

Os itens sugeridos devem ficar identificados como pendentes de confirmação.

O usuário deve poder:

- Aceitar uma sugestão.
- Rejeitar uma sugestão.
- Aceitar todas as sugestões.
- Rejeitar todas as sugestões.

Ao rejeitar uma sugestão, a resposta e a observação sugeridas devem ser removidas. Ao aceitar, o item deve deixar de ser considerado pendente.

### RF-14. Concluir aplicação

Ao concluir uma aplicação:

- O status deve mudar de `draft` para `completed`.
- Deve ser registrada a data de conclusão.
- A aplicação deve aparecer como concluída nos resumos e nos relatórios por tag.

Após a conclusão, o usuário deve poder iniciar outra aplicação para uma nova unidade ou para a mesma unidade, informando tags e data.

### RF-14.1. Repetir vistoria com as mesmas tags (atalho)

A partir de uma aplicação existente — ou do grupo do RF-07.1 —, o usuário deve poder criar uma nova aplicação **sem repetir a etapa manual de seleção de tags do RF-08**.

- O atalho copia `tagsIds` da aplicação de origem e usa a data atual como `date` da nova aplicação.
- A nova aplicação nasce como `draft`, com os itens do checklist copiados normalmente (mesmo comportamento de RF-08), e leva o usuário direto à tela de preenchimento.
- Não é um fluxo novo: é a mesma criação de aplicação de RF-08, apenas pré-preenchendo `tagsIds` a partir de uma aplicação existente em vez de exigir seleção manual. A validação de RNF-06 (mínimo 1 tag) continua satisfeita automaticamente, pois as tags copiadas já atendem o requisito.
- O atalho é uma ação sempre disponível a partir de uma aplicação/grupo, mas deve ficar em destaque quando a aplicação mais recente daquele grupo tiver ao menos 1 resposta com `semantic = negativo` (ver RF-07.1) — sinalizando que a unidade provavelmente precisa de revalidação.

### RF-15. Consultar relatório por tags (substitui o panorama fixo por unidade)

A tela de relatório (`/overview`) não possui agrupamento padrão pré-definido. Ela abre com um **multiselect de tags** que o usuário usa para montar a consulta na hora — não existe uma "view" inicial arbitrária, nem uma tag escolhida automaticamente como agrupamento.

Quando o usuário seleciona uma ou mais tags, o relatório deve considerar apenas aplicações que possuam **todas** as tags selecionadas (**AND / interseção**), olhando tanto as tags da aplicação quanto as tags de cada item dentro dela — uma aplicação é considerada parte do filtro se a(s) tag(s) estiver(em) em qualquer nível (aplicação ou item).

O relatório é sempre uma **query dinâmica**, recalculada a cada consulta — não existe entidade de "relatório salvo" nesta versão.

O relatório deve exibir, para o conjunto de aplicações que casam com o filtro:

- **Progresso agregado por item**: soma de itens respondidos ÷ soma de itens totais, entre todas as aplicações não excluídas que casam com o filtro.
- **Progresso agregado por aplicação**: quantidade de aplicações `completed` ÷ quantidade total de aplicações que casam com o filtro (não excluídas).
- **Pendências detalhadas**: lista dos itens especificamente sem resposta, agrupados por aplicação, restrita às aplicações (e, quando o filtro for por tag de item, aos itens) que casam com o filtro selecionado.

Ambos os progressos (item e aplicação) são **sempre derivados no momento da consulta**, nunca armazenados ou cacheados: uma nova aplicação em rascunho associada a uma tag reduz imediatamente os dois números daquela combinação de tags, sem necessidade de recálculo manual.

Aplicações com `deleted_at` preenchido são excluídas do numerador e do denominador de ambos os progressos, e não aparecem na lista de pendências.

### RF-16. Navegação global

O usuário deve ter acesso às áreas:

- Checklists.
- Relatório por tags (antigo overview/panorama).
- Nova vistoria ou novo checklist.
- Conta.

O botão de conta é apresentado na navegação, mas não possui fluxo operacional implementado no app atual.

## 4. Opções de Resposta

- Cada checklist define sua própria lista de opções de resposta (já existente em RF-03/04). Cada opção é um objeto estruturado:
  - `label`: texto exibido (ex.: "Sim", "Não", "Parcial", "Não aplica", "Não - sem acesso").
  - `semantic`: `positivo` | `negativo` | `neutro`.
- O conjunto padrão de opções (`Sim`, `Não`, `Parcial`) continua existindo como base sugerida ao criar um checklist, com `semantic` recomendado: `Sim` → `positivo`, `Não` → `negativo`, `Parcial` → `neutro`.
- **"Não aplica" (ou equivalente) não é uma 4ª opção padrão do sistema.** É **opt-in por checklist**: o usuário adiciona essa opção manualmente (com `semantic = neutro`) apenas nos checklists onde faz sentido.
- Opções adicionais de negação justificada (ex.: "Não - sem acesso", "Não - aguardando material") são criadas livremente pelo usuário por checklist, com `semantic = negativo`. O **motivo já está contido no próprio texto da opção escolhida** (`answer`) — não existe campo estruturado separado de "motivo"/"razão". O campo `note` continua existindo apenas como observação livre complementar, sempre opcional.
- Para fins de progresso (RF-10/RF-15), **qualquer opção escolhida conta como item respondido**, independentemente do seu `semantic`. O campo `semantic` serve para permitir, em relatórios futuros, distinguir quantos itens ficaram "neutros" ou "negativos justificados" — e é exatamente o que RF-07.1 passa a consumir (contagem de negativas por aplicação), fechando o gap de um campo que existia no modelo mas não era usado em nenhum requisito.

## 5. Requisitos Não Funcionais

### RNF-01. Idioma e localização

- O conteúdo da interface deve ser apresentado em português do Brasil.
- Datas exibidas devem seguir o contexto brasileiro.
- Não há mais um conjunto fixo obrigatório de respostas do sistema: `Sim`/`Não`/`Parcial` seguem como sugestão padrão ao criar um checklist, mas totalmente editável (ver seção 4).

### RNF-02. Responsividade

- O app deve funcionar em telas móveis e desktop.
- O fluxo de preenchimento deve permanecer utilizável em tela estreita.
- O combobox multiselect creatable de tags deve permanecer utilizável em tela estreita (criação e seleção por toque).
- A navegação inferior deve permanecer disponível nas páginas operacionais que usam o shell principal.

### RNF-03. Feedback de carregamento

- A aplicação deve apresentar estado de carregamento enquanto os dados do workspace não estiverem disponíveis.
- As rotas principais devem ter estado visual de carregamento durante a navegação ou carregamento de dados.
- O carregamento não deve exibir uma lista como se estivesse vazia antes da hidratação dos dados.
- O relatório por tags (RF-15) deve apresentar estado de carregamento durante o recálculo da query dinâmica ao alterar o filtro de tags.

### RNF-04. Persistência

- Alterações em checklists, itens, aplicações e tags devem ser persistidas automaticamente.
- Ao retornar ao app, os modelos, aplicações, respostas, observações, quantidades, anexos, status, transcrições e **tags associadas em todos os 4 níveis** (checklist, item de checklist, aplicação, item de aplicação) persistidos devem ser recuperados.
- A persistência deve conservar identificadores e relacionamentos entre checklist, item, aplicação e tags (`tagsIds` sempre referenciando ids válidos do catálogo global, mesmo que a tag referenciada esteja logicamente excluída).
- Falhas de persistência não devem apagar o estado já exibido ao usuário.

### RNF-05. Integridade dos dados

- Todo checklist deve possuir ao menos uma opção de resposta.
- Toda opção de resposta deve possuir `label` e `semantic` preenchidos.
- Todo item deve possuir identificador e posição.
- A ordem dos itens deve ser preservada.
- Uma aplicação deve referenciar o checklist que a originou.
- Uma aplicação deve possuir status `draft` ou `completed`.
- Datas de criação, atualização e conclusão devem ser armazenadas em formato de data/hora consistente.
- Exclusões de checklists, aplicações, tags e anexos devem ser representadas por estado de exclusão lógica.
- Exclusão lógica de uma tag não remove nem invalida as referências (`tagsIds`) já existentes em checklists, itens, aplicações ou itens de aplicação.
- Nomes de tag são normalizados (trim + case-insensitive) para evitar duplicatas no catálogo global.

### RNF-06. Validação de entrada

- Nome do checklist é obrigatório.
- Deve existir pelo menos um item no checklist.
- A aplicação exige **pelo menos 1 tag selecionada** (`tagsIds.length >= 1`). Não existe valor padrão automático de tag.
- Data da visita é obrigatória.
- Entradas vazias ou formadas apenas por espaços devem ser rejeitadas (inclusive para nomes de tag e opções).

### RNF-07. Atualização do progresso

- O percentual de preenchimento de uma aplicação individual deve ser atualizado imediatamente após uma resposta ser adicionada ou removida.
- O total exibido deve seguir o formato `respondidos/total`.
- O percentual deve considerar zero quando não houver itens.
- O progresso agregado por tag (RF-15) segue a mesma lógica de "qualquer resposta conta", agregada sobre o conjunto de aplicações filtrado, e é sempre recalculado no momento da consulta (nunca armazenado).

### RNF-08. Acessibilidade e interação

- Controles de ação devem possuir texto ou rótulo identificável.
- Campos de entrada devem possuir indicação clara de sua finalidade.
- Estados de sugestão, gravação, processamento e conclusão devem ser distinguíveis por texto, não apenas por cor.
- Estados derivados de progresso de aplicação ("não iniciada", "executando", "completa" — ver seção 6) e o status de conformidade do RF-07.1 devem ser distinguíveis por texto, não apenas por cor.
- A navegação por teclado deve alcançar campos, botões, links, controles de seleção e o combobox multiselect creatable de tags.

### RNF-09. Segurança de sessão

- O acesso aos dados deve respeitar a sessão do usuário autenticado.
- Uma sessão ausente ou inválida não deve ser tratada como uma sessão autenticada.
- O app deve suportar autenticação por sessão e por token encaminhado, conforme o ambiente de execução.
- **Não há captura automática de autoria por usuário/conta.** A plataforma não possui login funcional nesta versão; "quem fez o quê" é resolvido inteiramente por tags de responsável (`tagsIds`), atribuídas manualmente no checklist inteiro ou em itens específicos — não por `userId` ou qualquer dado de conta.

### RNF-10. Tolerância a ausência de dados

- Se não houver checklist, a biblioteca deve permitir iniciar a criação de um novo checklist.
- Se não houver aplicações, o histórico e o relatório por tags devem apresentar estado vazio sem erro.
- Se não houver tags no catálogo, o combobox creatable deve permitir criar a primeira tag diretamente no fluxo, sem exigir uma etapa de cadastro separada.
- Se uma rota referenciar um checklist ou aplicação inexistente, não deve exibir dados de outra entidade como se fossem os dados solicitados.

## 6. Estados Derivados de Aplicação (Visual, Não Persistido)

Além do status persistido (`draft`/`completed`), a interface deve derivar e exibir um estado de leitura mais granular, calculado a partir de `respondidos/total`, sem introduzir nenhum campo novo no banco:

| Estado exibido | Condição derivada |
|---|---|
| Não iniciada | `status = draft` e `respondidos = 0` |
| Executando | `status = draft` e `0 < respondidos < total` |
| Completa | `status = completed` |

Esse estado é puramente visual/derivado — não existe transição de estado explícita acionada pelo usuário nem campo persistido correspondente.

O **status de conformidade** do RF-07.1 (`Sem pendências` / `N negativas`) é um segundo eixo de estado derivado, independente deste: este eixo fala sobre *progresso de preenchimento*; o de conformidade fala sobre *qualidade das respostas dadas* (via `semantic`). Os dois são calculados separadamente e nenhum dos dois é persistido.

## 7. Consolidado de Rotas

| Rota | Área | Comportamento |
|---|---|---|
| `/` | Biblioteca | Lista, pesquisa por nome/tag, filtros por tag (nível checklist), métricas, duplicação, exclusão e acesso aos checklists. |
| `/overview` | Relatório por tags | Multiselect de tags (AND), sem agrupamento padrão; exibe progresso agregado por item, progresso agregado por aplicação e lista de pendências detalhadas para o filtro selecionado. |
| `/checklists/new` | Novo checklist | Cria e configura um checklist, incluindo tags do checklist e de cada item. |
| `/checklists/:id` | Aplicações do checklist | Exibe o modelo selecionado, métricas, histórico (agrupado por unidade em accordion, RF-07.1) e formulário de nova aplicação. |
| `/checklists/:id/edit` | Edição de checklist | Edita os dados, tags e itens do checklist existente. |
| `/checklists/:id/applications/new` | Nova aplicação | Abre o fluxo para selecionar/criar tags (qualquer tag do catálogo global) e informar data, e iniciar uma aplicação. |
| `/checklists/:id/applications/:applicationId` | Preenchimento | Permite responder itens, adicionar observações, quantidade, fotos, tags por item e usar voz/sugestões. |
| `/prototype/mobile-ux` | Protótipo de UX | Fluxo experimental com três variantes de navegação e conteúdo estático. Não faz parte do fluxo operacional persistido. |

### 7.1 Rotas de carregamento

As seguintes rotas possuem estado de carregamento equivalente ao da rota principal:

- `/`
- `/overview`
- `/checklists/:id`
- `/checklists/new`
- `/checklists/:id/edit`
- `/checklists/:id/applications/new`
- `/checklists/:id/applications/:applicationId`

## 8. Modelo de Dados Funcional

### 8.1 Tag

- `id`: identificador da tag.
- `label`: nome (normalizado — trim + case-insensitive — para evitar duplicatas no catálogo global).
- `created_at`, `updated_at`, `deleted_at`.

Sem `kind`, sem `parentTagId`, sem cor/ordem.

### 8.2 Checklist

- `id`: identificador do modelo.
- `title`: nome do modelo.
- `tagsIds`: `string[]` — tags do catálogo global associadas ao modelo.
- `options`: lista de opções de resposta disponíveis, cada uma `{ label: string, semantic: 'positivo' | 'negativo' | 'neutro' }`.
- `transcript`: última transcrição associada, quando houver.
- `source`: `manual` ou `audio_suggestion`.
- `items`: itens que serão replicados nas aplicações.
- `created_at`, `updated_at`, `deleted_at`.

### 8.3 Item de checklist

- `id`.
- `position`.
- `title`.
- `description`.
- `tagsIds`: `string[]` — tags do catálogo global associadas ao item do modelo (ex.: responsável padrão esperado), copiadas como valor inicial editável para o item de aplicação correspondente.
- `created_at`, `updated_at`, `deleted_at`.

### 8.4 Aplicação

- `id`.
- `checklistId`.
- `tagsIds`: `string[]` — tags do catálogo global associadas à aplicação (torre, apartamento, responsável geral, etc.), obrigatoriamente com pelo menos 1 elemento. **É esta lista, comparada por igualdade de conjunto entre aplicações, que define o agrupamento por unidade do RF-07.1** — não existe campo `unitId` ou equivalente.
- `date`.
- `status`: `draft` ou `completed`.
- `items`: cópia dos itens do checklist, com o preenchimento específico da visita.
- `created_at`, `updated_at`, `completed_at`, `deleted_at`.

### 8.5 Item de aplicação

- `id`.
- `position`.
- `title`.
- `description`.
- `answer`: referência à opção de resposta escolhida (`label`), podendo ser vazio.
- `note`: observação textual livre, sempre opcional.
- `quantity`, opcional.
- `attachments`.
- `tagsIds`: `string[]` — tags do catálogo global associadas ao item de aplicação (ex.: responsável específico daquele item), iniciado com a cópia das `tagsIds` do item de checklist correspondente e editável independentemente depois.
- `suggested`: indicando sugestão de resposta/observação ainda não confirmada.
- `created_at`, `updated_at`, `deleted_at`.

## 9. Fluxos de Replicação

### 9.1 Criar e aplicar um checklist

1. Acessar `/checklists/new`.
2. Selecionar um modelo existente ou preencher um checklist manualmente.
3. Informar nome, tags (combobox multiselect creatable), opções de resposta (com `semantic`) e itens, cada um podendo receber suas próprias tags.
4. Salvar o modelo.
5. Acessar o modelo pela biblioteca.
6. Escolher nova aplicação.
7. Selecionar/criar tags (qualquer tag do catálogo global) e informar a data.
8. Iniciar o preenchimento.

### 9.2 Preencher uma visita manualmente

1. Acessar `/checklists/:id/applications/:applicationId`.
2. Selecionar uma resposta para cada item, entre as opções configuradas no checklist.
3. Registrar observações complementares quando necessário.
4. Ajustar as tags do item, se o responsável daquele item específico for diferente do valor copiado do modelo.
5. Ativar quantidade para itens quantificáveis.
6. Adicionar fotos aos itens aplicáveis.
7. Revisar o percentual de preenchimento.
8. Concluir a aplicação.

### 9.3 Preencher uma visita por voz

1. Abrir uma aplicação em rascunho.
2. Iniciar a gravação.
3. Encerrar a gravação e aguardar o processamento.
4. Abrir a transcrição para revisão.
5. Solicitar sugestões de preenchimento (resposta e observação — tags não são sugeridas por voz).
6. Aceitar ou rejeitar sugestões individualmente ou em lote.
7. Ajustar manualmente os itens restantes, incluindo tags quando necessário.
8. Concluir a aplicação.

### 9.4 Repetir uma vistoria

1. Abrir o checklist desejado.
2. Consultar o histórico de aplicações (agrupado por unidade, RF-07.1).
3. Escolher nova aplicação — de duas formas:
   - **Fluxo completo** (RF-08): escolher "nova aplicação" no checklist e selecionar/criar as tags da nova visita (torre, apartamento, responsável) e informar a data.
   - **Atalho** (RF-14.1): a partir de um grupo/aplicação existente, disparar "repetir com as mesmas tags" — pula a seleção manual de tags, usando as do grupo de origem e a data atual.
4. Preencher a nova aplicação sem alterar as respostas das aplicações anteriores.

### 9.5 Consultar relatório por combinação de tags

1. Acessar `/overview`.
2. Selecionar uma ou mais tags no multiselect (ex.: "Torre A" + "Empreiteira X").
3. Visualizar progresso agregado por item e por aplicação, calculados apenas sobre aplicações (e itens, quando a tag estiver em nível de item) que possuam **todas** as tags selecionadas.
4. Consultar a lista de pendências detalhadas — itens específicos ainda sem resposta, agrupados por aplicação, dentro do filtro.
5. Ajustar o filtro (adicionar/remover tags) para refinar a consulta; o relatório é recalculado a cada alteração, sem etapa de salvar.

## 10. Comportamentos Fora do Fluxo Operacional / Fora de Escopo Nesta Versão

- `/prototype/mobile-ux` é um protótipo com dados estáticos e navegação local entre telas.
- As variantes `A`, `B` e `C` do protótipo podem ser alternadas por controle próprio ou pelas setas esquerda/direita do teclado.
- A área `Conta` é apresentada na navegação, mas não possui operações de perfil, preferências ou logout implementadas.
- Não existe tela de administração do catálogo de tags (listagem completa, edição ou exclusão manual fora dos 4 pontos de uso via combobox).
- Não existe entidade de "relatório salvo" — todo relatório por tag é uma query dinâmica recalculada a cada consulta.
- Não existe hierarquia formal entre tags (`parentTagId`) — cruzamentos são resolvidos por combinação de tags (AND) na mesma aplicação/item.
- O fluxo de sugestão por voz (RF-13) não sugere tags — permanece restrito a resposta e observação.
- Não há captura automática de autoria via login/conta/`userId` — responsabilidade é sempre modelada como tag manual.
- O agrupamento por unidade do RF-07.1 não introduz uma entidade "unidade"/"grupo" no banco — é calculado comparando `tagsIds` de aplicações em tempo de leitura.
