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
            out_file: "./logs/out.log",
            error_file: "./logs/error.log",
            log_file: "./logs/combined.log",
            time: true,
            env: {
                NODE_ENV: "development"
            }
        }
    ]
};