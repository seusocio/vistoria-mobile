import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Icon, type IconName } from '@/components/Icon'
import type { ChecklistTemplate } from '@/infra/data/templates'
import { colors } from '@/styles'
import { styles } from '../styles'

const TEMPLATE_ICON: Record<string, IconName> = {
  'template-vistoria-entrega': 'clipboard-check',
  'template-areas-comuns': 'shop',
  'template-instalacao-hidraulica': 'droplet',
}

interface TemplatePickerProps {
  templates: ChecklistTemplate[]
  selectedTemplateId?: string | null
  loadingTemplateId?: string | null
  onSelect?: (template: ChecklistTemplate) => void
}

export const TemplatePicker = memo(function TemplatePicker({
  templates,
  selectedTemplateId,
  loadingTemplateId,
  onSelect,
}: TemplatePickerProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.fieldLabel}>Começar a partir de um modelo</Text>
      <View style={styles.templateRow}>
        {templates.map((template) => {
          const isSelected = template.id === selectedTemplateId
          return (
            <Pressable
              key={template.id}
              style={({ pressed }) => [
                styles.templateCard,
                isSelected && styles.templateCardSelected,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => onSelect?.(template)}
              disabled={Boolean(loadingTemplateId)}
              accessibilityRole="button"
              accessibilityLabel={`Aplicar modelo ${template.title}`}
              accessibilityState={{
                selected: isSelected,
                disabled: Boolean(loadingTemplateId),
              }}
            >
              <Icon
                name={TEMPLATE_ICON[template.id] ?? 'clipboard-check'}
                size={20}
                color={isSelected ? colors.blue.base : colors.gray[600]}
              />
              <Text
                style={[
                  styles.templateLabel,
                  isSelected && styles.templateLabelSelected,
                ]}
              >
                {loadingTemplateId === template.id ? 'Aplicando...' : template.title}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
})
