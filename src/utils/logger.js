import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

const logger = pino({
    // 1. Set the log level based on environment variables
    level: process.env.LOG_LEVEL || 'info',

    // 2. Security Redaction: Prevents sensitive data from leaking into logs
    redact: {
        paths: [
            'req.headers.authorization', 
            'req.headers.cookie', 
            'body.password', 
            'body.passwordConfirm', 
            'body.token'
        ],
        censor: '[REDACTED]'
    },

    // 3. Conditional Dev Transport (Zero production performance overhead)
    ...(isDev && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                minimumLevel: 'trace',
                sync: true
            },
        },
    }),
});

export default logger;
