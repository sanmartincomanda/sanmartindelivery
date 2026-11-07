require 'xcodeproj'

path = 'ios/App/App.xcodeproj'
project = Xcodeproj::Project.open(path)
app = project.targets.find { |target| target.name == 'App' }
raise 'App target missing' unless app
target = project.new_target(:ui_test_bundle, 'StoreScreenshots', :ios, '15.0')
target.add_dependency(app)
source = project.main_group.new_file('../../scripts/ios/StoreScreenshots.swift')
target.add_file_references([source])
auth_source = project.main_group.new_file('../../scripts/ios/StoreNativeAuthTests.swift')
target.add_file_references([auth_source])
target.build_configurations.each do |configuration|
  configuration.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  configuration.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.sanmartinsr.app.screenshots'
  configuration.build_settings['TEST_TARGET_NAME'] = 'App'
  configuration.build_settings['GENERATE_INFOPLIST_FILE'] = 'YES'
  configuration.build_settings['SWIFT_VERSION'] = '5.0'
  configuration.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  configuration.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
end
project.save
scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_test_target(target)
scheme.save_as(path, 'StoreScreenshots', true)
