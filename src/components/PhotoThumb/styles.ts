import { StyleSheet } from 'react-native'
import { colors } from '@/styles'

export const styles = StyleSheet.create({
  container: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: colors.gray[100],
    borderWidth: 1,
    borderColor: colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderCurve: 'continuous',
    backgroundColor: colors.gray[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButton: {
    width: 64,
    height: 64,
    borderRadius: 10,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.blue.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
