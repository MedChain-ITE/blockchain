module.exports = {
    apps: [
        {
            name: "node-backend-demo",
            script: "npm",
            args: "run dev demo",
            cwd: "./",
            instances: 1,
            autorestart: true,
            watch: false,
            env: {
                NODE_ENV: "development"
            }
        }
    ]
};