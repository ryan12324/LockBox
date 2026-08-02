#!/usr/bin/env ruby
# frozen_string_literal: true

require 'xcodeproj'

project_path = File.expand_path('../apps/mobile/ios/App/App.xcodeproj', __dir__)
project = Xcodeproj::Project.open(project_path)
app_target = project.targets.find { |target| target.name == 'App' }
abort 'App target not found' unless app_target

def child_group(parent, name, path = name)
  parent.groups.find { |group| group.name == name || group.path == path } ||
    parent.new_group(name, path)
end

def file_reference(group, path)
  group.files.find { |file| file.path == path } || group.new_file(path)
end

def add_source(target, reference)
  return if target.source_build_phase.files_references.include?(reference)

  target.source_build_phase.add_file_reference(reference)
end

def add_resource(target, reference)
  return if target.resources_build_phase.files_references.include?(reference)

  target.resources_build_phase.add_file_reference(reference)
end

root_group = project.main_group
app_group = root_group.groups.find { |group| group.path == 'App' }
abort 'App source group not found' unless app_group

native_group = child_group(app_group, 'Native')
shared_group = child_group(root_group, 'Shared')
provider_group = child_group(root_group, 'CredentialProvider')

app_sources = %w[
  AuthwellBridgeViewController.swift
  AutofillPlugin.swift
  BiometricPlugin.swift
  CredentialManagerPlugin.swift
  StoragePlugin.swift
].map { |name| file_reference(native_group, name) }

shared_sources = %w[
  AuthwellDatabase.swift
  AuthwellShared.swift
  CredentialIdentityStore.swift
  DeviceCrypto.swift
].map { |name| file_reference(shared_group, name) }

provider_source = file_reference(provider_group, 'CredentialProviderViewController.swift')
file_reference(provider_group, 'Info.plist')
file_reference(provider_group, 'CredentialProvider.entitlements')
file_reference(app_group, 'App.entitlements')
app_privacy = file_reference(app_group, 'PrivacyInfo.xcprivacy')
provider_privacy = file_reference(provider_group, 'PrivacyInfo.xcprivacy')

# Authwell creates its Capacitor bridge programmatically. Removing storyboard
# build membership avoids a second lifecycle path and keeps CI independent of
# installed Simulator runtimes.
app_target.resources_build_phase.files.each do |build_file|
  reference = build_file.file_ref
  resource_name = reference&.path || reference&.name
  next unless %w[Main.storyboard LaunchScreen.storyboard].include?(resource_name)

  build_file.remove_from_project
end

provider_target = project.targets.find { |target| target.name == 'CredentialProvider' } ||
  project.new_target(:app_extension, 'CredentialProvider', :ios, '17.0')

(app_sources + shared_sources).each { |reference| add_source(app_target, reference) }
(shared_sources + [provider_source]).each { |reference| add_source(provider_target, reference) }
add_resource(app_target, app_privacy)
add_resource(provider_target, provider_privacy)

[app_target, provider_target].each do |target|
  target.add_system_framework(%w[AuthenticationServices CryptoKit LocalAuthentication Security])
  target.add_system_library_tbd('sqlite3')
end

project.build_configurations.each do |configuration|
  configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
end

app_target.build_configurations.each do |configuration|
  settings = configuration.build_settings
  settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  settings['TARGETED_DEVICE_FAMILY'] = '1,2'
end

provider_target.build_configurations.each do |configuration|
  settings = configuration.build_settings
  settings['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  settings['CODE_SIGN_ENTITLEMENTS'] = 'CredentialProvider/CredentialProvider.entitlements'
  settings['CODE_SIGN_STYLE'] = 'Automatic'
  settings['CURRENT_PROJECT_VERSION'] = '1'
  settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  settings['INFOPLIST_FILE'] = 'CredentialProvider/Info.plist'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0'
  settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
  settings['MARKETING_VERSION'] = '1.0.0'
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'dev.lockbox.app.autofill'
  settings['PRODUCT_NAME'] = 'AuthwellAutoFill'
  settings['SKIP_INSTALL'] = 'YES'
  settings['SWIFT_VERSION'] = '5.0'
  settings['TARGETED_DEVICE_FAMILY'] = '1,2'
end

unless app_target.dependencies.any? { |dependency| dependency.target == provider_target }
  app_target.add_dependency(provider_target)
end

embed_phase = app_target.copy_files_build_phases.find do |phase|
  phase.name == 'Embed App Extensions'
end
unless embed_phase
  embed_phase = project.new(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase)
  embed_phase.name = 'Embed App Extensions'
  embed_phase.symbol_dst_subfolder_spec = :plug_ins
  app_target.build_phases << embed_phase
end
unless embed_phase.files_references.include?(provider_target.product_reference)
  build_file = embed_phase.add_file_reference(provider_target.product_reference, true)
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end

project.save
puts "Configured #{project_path} with the Authwell AutoFill credential provider"
