import { BuildPlatformService } from "../services/platform/build-platform-service";
import { MainController } from "../controllers/main-controller";

export class DeployCommandHelper {
	constructor(
		private $buildPlatformService: BuildPlatformService,
		private $devicesService: Mobile.IDevicesService,
		private $mainController: MainController,
		private $options: IOptions,
		private $projectData: IProjectData
	) { }

	public async deploy(platform: string, additionalOptions?: ILiveSyncCommandHelperAdditionalOptions) {
		const emulator = this.$options.emulator;
		await this.$devicesService.initialize({
			deviceId: this.$options.device,
			platform,
			emulator,
			skipInferPlatform: !platform,
			sdk: this.$options.sdk
		});

		const devices = this.$devicesService.getDeviceInstances()
			.filter(d => !platform || d.deviceInfo.platform.toLowerCase() === platform.toLowerCase());

		const deviceDescriptors: ILiveSyncDeviceInfo[] = devices
			.map(d => {
				const buildConfig: IBuildConfig = {
					buildForDevice: !d.isEmulator,
					iCloudContainerEnvironment: this.$options.iCloudContainerEnvironment,
					projectDir: this.$options.path,
					clean: this.$options.clean,
					teamId: this.$options.teamId,
					device: this.$options.device,
					provision: this.$options.provision,
					release: this.$options.release,
					keyStoreAlias: this.$options.keyStoreAlias,
					keyStorePath: this.$options.keyStorePath,
					keyStoreAliasPassword: this.$options.keyStoreAliasPassword,
					keyStorePassword: this.$options.keyStorePassword
				};

				const buildAction = additionalOptions && additionalOptions.buildPlatform ?
					additionalOptions.buildPlatform.bind(additionalOptions.buildPlatform, d.deviceInfo.platform, buildConfig, this.$projectData) :
					this.$buildPlatformService.buildPlatform.bind(this.$buildPlatformService, d.deviceInfo.platform, buildConfig, this.$projectData);

				const outputPath = additionalOptions && additionalOptions.getOutputDirectory && additionalOptions.getOutputDirectory({
					platform: d.deviceInfo.platform,
					emulator: d.isEmulator,
					projectDir: this.$projectData.projectDir
				});

				const info: ILiveSyncDeviceInfo = {
					identifier: d.deviceInfo.identifier,
					buildAction,
					debugggingEnabled: additionalOptions && additionalOptions.deviceDebugMap && additionalOptions.deviceDebugMap[d.deviceInfo.identifier],
					debugOptions: this.$options,
					outputPath,
					skipNativePrepare: additionalOptions && additionalOptions.skipNativePrepare,
				};

				return info;
			});

		const liveSyncInfo: ILiveSyncInfo = {
			projectDir: this.$projectData.projectDir,
			skipWatcher: !this.$options.watch,
			clean: this.$options.clean,
			release: this.$options.release,
			env: this.$options.env,
			timeout: this.$options.timeout,
			useHotModuleReload: this.$options.hmr,
			force: this.$options.force,
			emulator: this.$options.emulator
		};

		await this.$mainController.deployOnDevices(this.$projectData.projectDir, deviceDescriptors, liveSyncInfo);
	}
}
$injector.register("deployCommandHelper", DeployCommandHelper);
