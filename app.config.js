module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    convexUrl: process.env.CONVEX_URL || process.env.EXPO_PUBLIC_CONVEX_URL,
  },
})
