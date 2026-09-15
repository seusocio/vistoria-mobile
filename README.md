# Orçamento de Serviços (React Native)

Este projeto é um desafio para estudantes da Rocketseat. O objetivo é construir um app mobile para criação e gestão de orçamentos de serviços, aplicando boas práticas de UI, componentes reutilizáveis, tipagem com TypeScript e armazenamento local.

## 🚀 Tecnologias

- React Native 0.81 (Hermes)
- TypeScript
- React Navigation
- Async Storage (persistência local)
- react-native-svg (ícones SVG)
- PNPM

## 🧭 Como rodar

```bash
pnpm install
pnpm start
# Em outro terminal
pnpm android
# ou
pnpm ios
```

### Seed manual do Convex

Para publicar as funções e inserir as tags, apartamentos e checklists iniciais no deployment configurado:

```bash
bun run convex:seed
```

O comando é idempotente: executar novamente não duplica as tags nem os checklists semeados.

## 📚 Documentação

A documentação dos componentes e padrões do projeto está organizada na pasta `docs/`.

- Guia principal: [`docs/README.md`](./docs/README.md)

### Português (PT)
- [Botão - Padrão Legado](./docs/pt/button-legacy-pattern.md)
- [Botão - Padrão de Composição](./docs/pt/button-composition-pattern.md)
- [Checkbox](./docs/pt/checkbox-guide.md)
- [Input](./docs/pt/input-guide.md)
- [Radio](./docs/pt/radio-guide.md)
- [MoneyLabel](./docs/pt/money-label-guide.md)
- [Ícones (SVG)](./docs/pt/icon-guide.md)

### English (EN)
- [Button - Legacy Pattern](./docs/en/button-legacy-pattern.md)
- [Button - Composition Pattern](./docs/en/button-composition-pattern.md)
- [Checkbox](./docs/en/checkbox-guide.md)
- [Input](./docs/en/input-guide.md)
- [Radio](./docs/en/radio-guide.md)
- [MoneyLabel](./docs/en/money-label-guide.md)
- [Icons (SVG)](./docs/en/icon-guide.md)

## 📦 Estrutura (resumo)

```
src/
├── app/                # Telas e fluxos
├── components/         # Componentes reutilizáveis
├── assets/             # Ícones e imagens
├── data/               # Seed, storage e dados mock
└── styles/             # Tokens, tipografia, cores
```

## 📝 Licença

Uso educacional no contexto do desafio Rocketseat.
