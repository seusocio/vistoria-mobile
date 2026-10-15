# Ícones (Phosphor)

O app usa o [Phosphor](https://phosphoricons.com) via `phosphor-react-native`.
Nenhum SVG é mantido no repositório.

## Uso

```tsx
import { Icon } from '@/components/Icon'

<Icon name="trash-2" size={18} color={colors.danger.base} />
```

`name` é sempre um nome do app (`IconName`), nunca o nome do Phosphor. Assim,
trocar o desenho de um ícone é uma linha em `src/components/Icon/registry.ts`,
sem tocar nas telas.

Props: `size` (padrão 24), `color`, `weight` (`thin` | `light` | `regular` |
`bold` | `fill` | `duotone`, padrão `regular`) e qualquer prop de
`react-native-svg`.

## Adicionar um ícone

1. Escolha o ícone em phosphoricons.com e anote o nome, ex.: `Image`.
2. Em `src/components/Icon/types.ts`, adicione o nome do app à union `IconName`.
3. Em `src/components/Icon/registry.ts`, importe pelo caminho do ícone e
   registre:

```ts
import { ImageIcon } from 'phosphor-react-native/src/icons/Image'
// ...
image: { component: ImageIcon },
```

Importe sempre `phosphor-react-native/src/icons/<Nome>`, nunca a raiz do
pacote: o Metro não faz tree-shaking e a raiz reexporta mais de mil ícones.

Para controles de mídia (play, stop), registre com `weight: 'fill'`.
