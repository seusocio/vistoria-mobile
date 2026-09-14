import AsyncStorage from '@react-native-async-storage/async-storage'

export async function readCollection<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T[]) : []
  } catch (error) {
    console.error(`Error reading collection ${key}:`, error)
    return []
  }
}

export async function writeCollection<T>(
  key: string,
  items: T[],
): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(items))
  } catch (error) {
    console.error(`Error writing collection ${key}:`, error)
    throw error
  }
}
