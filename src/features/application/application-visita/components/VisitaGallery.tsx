// The visit's photo gallery, as its own tab. Photos inside notes link back here.
import { MotiView } from 'moti'
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Icon } from '@/components/Icon'
import { colors, radius, space, textStyles } from '@/styles'

export interface GalleryPhoto {
  id: string
  uri: string | undefined
  uploading: boolean
  failed: boolean
  progress: number
  onPress: () => void
  onRemove: () => void
  onRetry: () => void
}

/** The "Fotos" tab: every visit photo as a 3-column grid, with remove (confirmed by the caller) and retry. */
export function VisitaGallery({ photos, reference }: { photos: GalleryPhoto[]; reference: boolean }) {
  const { width } = useWindowDimensions()
  const gap = space.sm
  const side = space.lg
  const tile = Math.floor((width - side * 2 - gap * 2) / 3)
  return (
    <View style={[s.grid, { paddingHorizontal: side, gap }]}>
      {reference ? (
        <Text style={[s.reference, { width: '100%' }]}>Galeria da aplicação anterior disponível como referência.</Text>
      ) : null}
      {photos.length === 0 ? (
        <View style={s.empty}>
          <Text style={textStyles.bodyStrong}>Nenhuma foto ainda</Text>
          <Text style={[textStyles.body, { textAlign: 'center' }]}>As fotos enviadas nas notas aparecem aqui.</Text>
        </View>
      ) : (
        photos.map((photo, index) => (
          <MotiView
            key={photo.id}
            style={{ width: tile, height: tile }}
            from={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'timing', duration: 180, delay: Math.min(index, 12) * 20 }}
          >
            <GridTile photo={photo} />
          </MotiView>
        ))
      )}
    </View>
  )
}

function GridTile({ photo }: { photo: GalleryPhoto }) {
  return (
    <Pressable style={s.gridTile} onPress={photo.failed ? photo.onRetry : photo.onPress}>
      {photo.uri ? <Image source={{ uri: photo.uri }} style={s.fill} /> : null}
      {photo.uploading ? (
        <View style={s.gridOverlay}>
          <Text style={s.gridOverlayText}>{Math.round(photo.progress * 100)}%</Text>
        </View>
      ) : null}
      {photo.failed ? (
        <View style={s.gridOverlay}>
          <Text style={s.gridOverlayText}>Tentar de novo</Text>
        </View>
      ) : null}
      <Pressable style={s.remove} hitSlop={10} onPress={photo.onRemove} accessibilityLabel="Remover foto">
        <Icon name="multiply" size={12} color={colors.white} />
      </Pressable>
    </Pressable>
  )
}

const s = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  reference: { ...textStyles.metaLabel, color: colors.blue.base },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: space.lg },
  gridTile: { flex: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.gray[100] },
  gridOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(18,21,28,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridOverlayText: { ...textStyles.metaLabel, color: colors.white },
  remove: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(18,21,28,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { width: '100%', alignItems: 'center', paddingVertical: space.xxl, gap: space.xs },
})
