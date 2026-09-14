const fs = require('node:fs')
const path = require('node:path')
const { withDangerousMod } = require('@expo/config-plugins')
const {
  mergeContents,
} = require('@expo/config-plugins/build/utils/generateCode')

/**
 * whisper-kit-expo links the WhisperKit Swift Package via the cocoapods-spm
 * plugin, which has no config plugin of its own. Expo prebuild regenerates the
 * Podfile from a template, wiping any manual edits, so this plugin re-injects:
 *   1. `plugin "cocoapods-spm"` at the top level.
 *   2. `spm_pkg "WhisperKit"` inside the app target (required so the package is
 *      resolvable by the pod that depends on it).
 *   3. Portuguese (`pt`) decoding in the wrapper, because whisper-kit-expo
 *      otherwise pre-fills Whisper's language token as English.
 * All insertions and the source patch are idempotent, so running prebuild
 * repeatedly is safe. Re-run prebuild after reinstalling dependencies.
 * Also requires: `sudo gem install cocoapods-spm` before `pod install`.
 */
function patchWhisperKitLanguage(projectRoot) {
  const packageJsonPath = require.resolve('whisper-kit-expo/package.json', {
    paths: [projectRoot],
  })
  const sourcePath = path.join(
    path.dirname(packageJsonPath),
    'ios',
    'WhisperKitExpoModule.swift',
  )
  const source = fs.readFileSync(sourcePath, 'utf8')
  const languagePatch = 'decodeOptions: DecodingOptions(language: "pt")'

  if (source.includes(languagePatch)) return

  const originalCall =
    'let transcription: TranscriptionResult = try await self.pipe.transcribe(audioPath: path)[0]'
  if (!source.includes(originalCall)) {
    throw new Error(
      'Unsupported whisper-kit-expo source: cannot configure Portuguese transcription.',
    )
  }

  const patchedSource = source.replace(
    originalCall,
    [
      'let transcription = try await self.pipe.transcribe(',
      '            audioPath: path,',
      `            ${languagePatch}`,
      '        )[0]',
    ].join('\n'),
  )
  fs.writeFileSync(sourcePath, patchedSource)
}

module.exports = function withWhisperKit(config) {
  return withDangerousMod(config, [
    'ios',
    (config) => {
      patchWhisperKitLanguage(config.modRequest.projectRoot)
      const podfilePath = path.join(
        config.modRequest.platformProjectRoot,
        'Podfile',
      )
      let contents = fs.readFileSync(podfilePath, 'utf8')

      contents = mergeContents({
        tag: 'whisperkit-plugin',
        src: contents,
        newSrc: [
          'plugin "cocoapods-spm"',
          '',
          'pre_integrate do |installer|',
          '  require_relative "../plugins/cocoapods-spm-patch"',
          'end',
        ].join('\n'),
        anchor: /prepare_react_native_project!/,
        offset: 1,
        comment: '#',
      }).contents

      contents = mergeContents({
        tag: 'whisperkit-spm-pkg',
        src: contents,
        newSrc: [
          '  spm_pkg "WhisperKit",',
          '    :url => "https://github.com/argmaxinc/WhisperKit.git",',
          '    :version => "0.6.0",',
          '    :products => ["WhisperKit"]',
        ].join('\n'),
        anchor: /use_expo_modules!/,
        offset: 1,
        comment: '#',
      }).contents

      fs.writeFileSync(podfilePath, contents)
      return config
    },
  ])
}
