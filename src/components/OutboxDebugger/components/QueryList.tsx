import type { Query } from '@tanstack/react-query'
import { useState } from 'react'
import { Pressable, Text, TextInput, View } from 'react-native'
import { queryClient } from '@/lib/query-client'
import { colors } from '@/styles'
import { styles } from '../styles'
import { json, keyLabel, querySummary, time } from '../utils'
import { ActionButton } from './ActionButton'
import { ErrorBlock } from './ErrorBlock'

export function QueryList({ queries }: { queries: Query[] }) {
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const needle = filter.trim().toLowerCase()
  const shown = queries
    .filter((query) => !needle || keyLabel(query).toLowerCase().includes(needle))
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)

  return (
    <>
      <TextInput
        style={styles.filter}
        placeholder="Filtrar por key (ex.: notes, application_f54b)"
        placeholderTextColor={colors.gray[400]}
        value={filter}
        onChangeText={setFilter}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <View style={styles.actions}>
        <ActionButton label="Invalidate all" onPress={() => void queryClient.invalidateQueries()} />
      </View>
      {shown.length === 0 && <Text style={styles.empty}>Nenhuma query no cache.</Text>}
      {shown.map((query) => {
        const summary = querySummary(query)
        const isOpen = expanded === query.queryHash
        const failed = summary.status === 'error'
        return (
          <Pressable
            key={query.queryHash}
            style={[styles.card, failed && styles.cardFailed]}
            onPress={() => setExpanded(isOpen ? null : query.queryHash)}
          >
            <Text style={styles.cardTitle}>{keyLabel(query)}</Text>
            <Text style={[styles.badge, failed ? styles.badgeFailed : styles.badgePending]}>
              {summary.status} · {summary.fetchStatus}
              {summary.stale ? ' · stale' : ''}
            </Text>
            <Text style={styles.meta}>
              {summary.data} · {summary.observers} observers · updated{' '}
              {summary.updatedAt ? time(summary.updatedAt) : 'never'}
            </Text>
            {summary.error !== null && <ErrorBlock error={String(summary.error)} />}
            {isOpen && (
              <>
                <Text style={styles.code}>{json(query.state.data)}</Text>
                <View style={styles.actions}>
                  <ActionButton label="Refetch" onPress={() => void queryClient.refetchQueries({ queryKey: query.queryKey, exact: true })} />
                  <ActionButton label="Invalidate" onPress={() => void queryClient.invalidateQueries({ queryKey: query.queryKey, exact: true })} />
                  <ActionButton label="Remove" danger onPress={() => queryClient.removeQueries({ queryKey: query.queryKey, exact: true })} />
                </View>
              </>
            )}
          </Pressable>
        )
      })}
    </>
  )
}
