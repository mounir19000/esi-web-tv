import setupE2eResources from "./global-setup"

setupE2eResources().catch((error) => {
  console.error(error)
  process.exit(1)
})
