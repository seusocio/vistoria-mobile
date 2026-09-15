# Componentes prontos

Código para copiar e adaptar. Assume `@gorhom/bottom-sheet` v5, `react-navigation` e `expo-haptics`.

## Índice

1. [Setup na raiz](#1-setup-na-raiz)
2. [Backdrop padrão](#2-backdrop-padrão)
3. [SearchScreen — search como botão falso](#3-searchscreen)
4. [SelectRow + SelectSheet — seleção única](#4-selectrow--selectsheet)
5. [MultiSelectSheet — seleção múltipla](#5-multiselectsheet)
6. [QuickAddSheet](#6-quickaddsheet)
7. [UndoSnackbar](#7-undosnackbar)
8. [DatePickerSheet](#8-datepickersheet)
9. [Campos de texto: teclado e autofill](#9-campos-de-texto-teclado-e-autofill)

---

## 1. Setup na raiz

Uma vez só, envolvendo o app inteiro. `GestureHandlerRootView` precisa vir por fora, senão os gestos do sheet não funcionam.

```tsx
// App.tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BottomSheetModalProvider>
        <NavigationContainer>{/* ... */}</NavigationContainer>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}
```

No Android, garanta `adjustResize` (Expo: `android.softwareKeyboardLayoutMode: "resize"` no app.json). Sem isso o teclado cobre o sheet em vez de empurrá-lo.

---

## 2. Backdrop padrão

Todo sheet usa este backdrop. Sem ele o sheet não parece modal.

```tsx
// src/ui/sheetBackdrop.tsx
import { useCallback } from 'react';
import { BottomSheetBackdrop, BottomSheetBackdropProps } from '@gorhom/bottom-sheet';

export function useSheetBackdrop() {
  return useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.4}
      />
    ),
    [],
  );
}
```

---

## 3. SearchScreen

O detalhe que importa: no Android, `autoFocus` durante a transição de tela costuma ser descartado e a tela abre sem teclado. Focar depois que a animação termina resolve nas duas plataformas.

```tsx
// src/screens/SearchScreen.tsx
import { useEffect, useRef, useState } from 'react';
import { InteractionManager, TextInput, View, Pressable, Text, StyleSheet } from 'react-native';
import { space, radius, touch } from '../ui/tokens';

export function SearchScreen({ navigation }) {
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      inputRef.current?.focus();
    });
    return () => task.cancel();
  }, []);

  const handleBack = () => {
    setQuery('');
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <View style={styles.bar}>
        <Pressable onPress={handleBack} hitSlop={12} style={styles.backBtn}>
          <BackIcon size={22} />
        </Pressable>
        <TextInput
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar"
          style={styles.input}
          returnKeyType="search"
          clearButtonMode="while-editing"   // iOS
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery('')} hitSlop={12}>
            <ClearIcon size={18} />
          </Pressable>
        )}
      </View>

      {query.length === 0 ? <RecentSearches /> : <Results query={query} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    height: 56,
  },
  backBtn: { minWidth: touch.min / 2, justifyContent: 'center' },
  input: { flex: 1, fontSize: 17, paddingVertical: space.sm },
});
```

E o botão falso que leva até aqui:

```tsx
// src/ui/FakeSearchInput.tsx
export function FakeSearchInput({ onPress, placeholder = 'Buscar' }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.fake}
      accessibilityRole="search"
      accessibilityLabel={placeholder}
    >
      <SearchIcon size={18} color="#8A8A8E" />
      <Text style={styles.placeholder}>{placeholder}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fake: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: touch.min,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    backgroundColor: '#F2F2F7',
  },
  placeholder: { fontSize: 16, color: '#8A8A8E' },
});
```

---

## 4. SelectRow + SelectSheet

A row mostra valor, o sheet mostra opções. Seleção única fecha ao escolher.

```tsx
// src/ui/SelectRow.tsx
export function SelectRow({ label, value, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value ?? 'não definido'}`}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.right}>
        <Text style={[styles.value, !value && styles.valueEmpty]}>
          {value ?? 'Selecionar'}
        </Text>
        <ChevronIcon size={16} color="#C7C7CC" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: touch.min,
    paddingHorizontal: space.lg,
  },
  label: { fontSize: 16 },
  right: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  value: { fontSize: 16, color: '#3C3C43' },
  valueEmpty: { color: '#C7C7CC' },
});
```

```tsx
// src/ui/SelectSheet.tsx
import { forwardRef, useCallback } from 'react';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import * as Haptics from 'expo-haptics';
import { useSheetBackdrop } from './sheetBackdrop';

type Option<T> = { value: T; label: string; icon?: React.ReactNode };

export const SelectSheet = forwardRef(function SelectSheet<T>(
  { title, options, selected, onSelect },
  ref: React.Ref<BottomSheetModal>,
) {
  const backdrop = useSheetBackdrop();

  const handleSelect = useCallback(
    (value: T) => {
      Haptics.selectionAsync();
      onSelect(value);
      (ref as any).current?.dismiss();   // única: aplica e fecha
    },
    [onSelect, ref],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={backdrop}
    >
      <BottomSheetView style={styles.content}>
        <Text style={styles.title}>{title}</Text>
        {options.map((opt) => (
          <Pressable
            key={String(opt.value)}
            onPress={() => handleSelect(opt.value)}
            style={styles.option}
            accessibilityRole="button"
            accessibilityState={{ selected: opt.value === selected }}
          >
            {opt.icon}
            <Text style={styles.optionLabel}>{opt.label}</Text>
            {opt.value === selected && <CheckIcon size={18} />}
          </Pressable>
        ))}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const styles = StyleSheet.create({
  content: { paddingBottom: space.xl, paddingHorizontal: space.lg },
  title: { fontSize: 13, color: '#8A8A8E', textTransform: 'uppercase', marginBottom: space.sm },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    minHeight: touch.min,
  },
  optionLabel: { flex: 1, fontSize: 17 },
});
```

Uso:

```tsx
const priorityRef = useRef<BottomSheetModal>(null);

<SelectRow
  label="Prioridade"
  value={priorityLabel}
  onPress={() => priorityRef.current?.present()}
/>
<SelectSheet
  ref={priorityRef}
  title="Prioridade"
  options={PRIORITIES}
  selected={priority}
  onSelect={setPriority}
/>
```

---

## 5. MultiSelectSheet

Diferenças em relação ao anterior: mantém aberto, acumula seleção e confirma no botão. O botão fica fixo no rodapé, no alcance do polegar.

Repare que `onChange` sobe para o pai a cada toque, e não só no "Concluído". É de propósito: se o usuário marcar três opções e arrastar o sheet pra baixo em vez de confirmar, as três continuam valendo. O botão serve para fechar com intenção, não para ser a única forma de salvar — fechar nunca descarta trabalho.

```tsx
export const MultiSelectSheet = forwardRef(function MultiSelectSheet(
  { title, options, selected, onChange, onDone },
  ref: React.Ref<BottomSheetModal>,
) {
  const backdrop = useSheetBackdrop();

  const toggle = (value) => {
    Haptics.selectionAsync();
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  };

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={['60%']}
      enablePanDownToClose
      backdropComponent={backdrop}
    >
      <BottomSheetFlatList
        data={options}
        keyExtractor={(o) => String(o.value)}
        ListHeaderComponent={<Text style={styles.title}>{title}</Text>}
        contentContainerStyle={{ paddingHorizontal: space.lg }}
        renderItem={({ item }) => (
          <Pressable onPress={() => toggle(item.value)} style={styles.option}>
            <Checkbox checked={selected.includes(item.value)} />
            <Text style={styles.optionLabel}>{item.label}</Text>
          </Pressable>
        )}
      />
      <View style={styles.footer}>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => {
            onDone?.();
            (ref as any).current?.dismiss();
          }}
        >
          <Text style={styles.primaryBtnText}>
            Concluído{selected.length > 0 ? ` (${selected.length})` : ''}
          </Text>
        </Pressable>
      </View>
    </BottomSheetModal>
  );
});
```

---

## 6. QuickAddSheet

Campo focado, ações rápidas acima do teclado, enter salva. Note o `BottomSheetTextInput` e as três props de teclado.

```tsx
export const QuickAddSheet = forwardRef(function QuickAddSheet({ onCreate }, ref) {
  const backdrop = useSheetBackdrop();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(null);

  const submit = () => {
    if (!title.trim()) return;
    onCreate({ title: title.trim(), due });
    setTitle('');
    setDue(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    ref.current?.dismiss();
  };

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      enableBlurKeyboardOnGesture          // fecha o teclado ao começar a arrastar
      android_keyboardInputMode="adjustResize"
      backdropComponent={backdrop}
    >
      <BottomSheetView style={styles.quickAdd}>
        <BottomSheetTextInput
          autoFocus
          value={title}
          onChangeText={setTitle}
          placeholder="Nova tarefa"
          style={styles.quickInput}
          returnKeyType="done"
          onSubmitEditing={submit}
          blurOnSubmit={false}
          autoCapitalize="sentences"
          autoCorrect
        />

        <View style={styles.chipRow}>
          <Chip icon={<CalendarIcon />} label={due ? formatDue(due) : 'Data'} onPress={openDate} />
          <Chip icon={<FlagIcon />} label="Prioridade" onPress={openPriority} />
          <View style={{ flex: 1 }} />
          <Pressable onPress={submit} disabled={!title.trim()} hitSlop={10}>
            <SendIcon color={title.trim() ? '#0A84FF' : '#C7C7CC'} />
          </Pressable>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});
```

`blurOnSubmit={false}` mantém o teclado aberto entre criações seguidas — importante para quem está despejando várias tarefas de uma vez.

---

## 7. UndoSnackbar

Remoção otimista com janela de desfazer. A chamada de rede só sai quando a janela expira, então desfazer é cancelar um timer.

```tsx
// src/hooks/useUndoableAction.ts
import { useRef, useState, useCallback, useEffect } from 'react';

const UNDO_WINDOW = 5000;

export function useUndoableAction<T>({ onCommit, onRevert }) {
  const [pending, setPending] = useState<{ item: T; message: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const run = useCallback((item: T, message: string) => {
    if (timer.current) {           // já havia um pendente: efetiva o anterior
      clearTimeout(timer.current);
      if (pending) onCommit(pending.item);
    }
    setPending({ item, message });
    timer.current = setTimeout(() => {
      onCommit(item);
      setPending(null);
      timer.current = null;
    }, UNDO_WINDOW);
  }, [onCommit, pending]);

  const undo = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (pending) onRevert(pending.item);
    setPending(null);
    timer.current = null;
  }, [pending, onRevert]);

  // se a tela desmontar com algo pendente, efetiva — não some silenciosamente
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      if (pending) onCommit(pending.item);
    }
  }, [pending, onCommit]);

  return { pending, run, undo };
}
```

```tsx
export function UndoSnackbar({ pending, onUndo }) {
  if (!pending) return null;
  return (
    <Animated.View entering={SlideInDown} exiting={SlideOutDown} style={styles.snackbar}>
      <Text style={styles.snackbarText}>{pending.message}</Text>
      <Pressable onPress={onUndo} hitSlop={12}>
        <Text style={styles.undoText}>Desfazer</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  snackbar: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    bottom: space.xl,        // acima da tab bar, se houver
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    minHeight: touch.min,
    borderRadius: radius.md,
    backgroundColor: '#1C1C1E',
  },
  snackbarText: { color: '#fff', fontSize: 15, flex: 1 },
  undoText: { color: '#0A84FF', fontSize: 15, fontWeight: '600' },
});
```

---

## 8. DatePickerSheet

Atalhos primeiro; calendário só para quem precisa.

```tsx
const SHORTCUTS = [
  { label: 'Hoje',          get: () => startOfDay(new Date()) },
  { label: 'Amanhã',        get: () => startOfDay(addDays(new Date(), 1)) },
  { label: 'Fim de semana', get: () => startOfDay(nextSaturday(new Date())) },
  { label: 'Próx. semana',  get: () => startOfDay(nextMonday(new Date())) },
  { label: 'Sem data',      get: () => null },
];

export const DatePickerSheet = forwardRef(function DatePickerSheet({ value, onChange }, ref) {
  const backdrop = useSheetBackdrop();
  const [showCalendar, setShowCalendar] = useState(false);

  const pick = (date) => {
    Haptics.selectionAsync();
    onChange(date);
    ref.current?.dismiss();
  };

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={backdrop}
      onDismiss={() => setShowCalendar(false)}
    >
      <BottomSheetView style={styles.content}>
        <View style={styles.shortcutGrid}>
          {SHORTCUTS.map((s) => (
            <Pressable key={s.label} style={styles.shortcut} onPress={() => pick(s.get())}>
              <Text style={styles.shortcutText}>{s.label}</Text>
            </Pressable>
          ))}
        </View>

        {showCalendar ? (
          <Calendar selected={value} onSelect={pick} />
        ) : (
          <Pressable style={styles.calendarToggle} onPress={() => setShowCalendar(true)}>
            <CalendarIcon size={18} />
            <Text style={styles.calendarToggleText}>Escolher data</Text>
          </Pressable>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
});
```

`onDismiss` recolhendo o calendário garante que a próxima abertura volte aos atalhos — que é o caso comum.

---

## 9. Campos de texto: teclado e autofill

Tabela de referência. Cada campo de texto do app deve conseguir preencher uma linha desta tabela — se não conseguir, provavelmente é um campo que não precisava existir.

| Campo | `keyboardType` | `textContentType` (iOS) | `autoComplete` (Android) |
|---|---|---|---|
| E-mail | `email-address` | `emailAddress` | `email` |
| Senha | — | `password` | `password` |
| Nova senha | — | `newPassword` | `password-new` |
| Código OTP | `number-pad` | `oneTimeCode` | `sms-otp` |
| Telefone | `phone-pad` | `telephoneNumber` | `tel` |
| Nome | `default` | `name` | `name` |
| CEP | `number-pad` | `postalCode` | `postal-code` |
| Valor | `decimal-pad` | — | — |
| Busca | `default` | — | `off` |

Para e-mail, adicione sempre `autoCapitalize="none"` e `autoCorrect={false}` — o teclado capitalizando a primeira letra de um e-mail é uma das causas mais comuns de erro de login que ninguém consegue explicar.

```tsx
<TextInput
  value={email}
  onChangeText={setEmail}
  keyboardType="email-address"
  textContentType="emailAddress"
  autoComplete="email"
  autoCapitalize="none"
  autoCorrect={false}
  accessibilityLabel="E-mail"
/>
```

E rótulo fora do campo, sempre:

```tsx
<View style={styles.field}>
  <Text style={styles.fieldLabel}>E-mail</Text>
  <TextInput {...emailProps} style={styles.fieldInput} />
  {error && <Text style={styles.fieldError}>{error}</Text>}
</View>
```

O `fieldLabel` continua visível depois que o usuário digita — que é exatamente o que o placeholder não faz, e o motivo de ele não servir como rótulo.
