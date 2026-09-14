# Monkey-patch for cocoapods-spm (>= 0.1.20).
#
# Its post-integrate hooks (UpdateCopyResourcesScript / UpdateEmbedFrameworksScript)
# append the SPM package's resources/frameworks into the aggregate target's
# `*-<Config>-input-files.xcfilelist` files, opening them with mode "r+".
# CocoaPods only emits those .xcfilelist files when the app target already has
# CocoaPods-managed resources/frameworks. This Expo app has none, so the files
# are absent and the hook crashes with:
#   Errno::ENOENT ... Pods-<target>-resources-Debug-input-files.xcfilelist
#
# We wrap `update_script` to `touch` the expected input/output files first, then
# delegate to the original implementation. Guarded so it patches at most once.
require "fileutils"
require "cocoapods-spm/hooks/helpers/update_script"

module Pod
  module SPM
    module UpdateScript
      module Mixin
        unless method_defined?(:__spm_ensure_files_orig_update_script)
          alias_method :__spm_ensure_files_orig_update_script, :update_script

          def update_script(options = {})
            script_name = options[:name]
            content_by_target = options[:content_by_target]
            targets = aggregate_targets + pod_targets.flat_map do |t|
              t.test_specs.map { |s| Target::NonLibrary.new(underlying: t, spec: s) }
            end

            targets.each do |target|
              _lines, input_paths, _output_paths = content_by_target.call(target)
              next if input_paths.empty?

              user_build_configurations.each_key do |config|
                ["#{script_name}_input_files_path", "#{script_name}_output_files_path"].each do |accessor|
                  path = target.send(accessor, config)
                  next if path.nil?

                  FileUtils.mkdir_p(File.dirname(path))
                  FileUtils.touch(path) unless File.exist?(path)
                end
              end
            end

            __spm_ensure_files_orig_update_script(options)
          end
        end
      end
    end
  end
end
