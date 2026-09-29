const isProd = process.env.NODE_ENV === 'production';

const cookieOpts = {
    httpOnly: true,
    secure: isProd ? true : false,
    sameSite: isProd ? 'strict' : 'none',
};

const setCookie = (res, { accessToken, refreshToken }) => {
    res.cookie('accessToken', accessToken, {
        ...cookieOpts,
        maxAge: 15 * 60 * 1000
    })
    res.cookie('refreshToken', refreshToken, {
        ...cookieOpts,
        path: "/api/v1/auth",
        maxAge: 7 * 24 * 60 * 60 * 1000
    })
}

const clearCookie = (res) => {
    res.clearCookie('accessToken', cookieOpts);
    res.clearCookie('refreshToken', { ...cookieOpts, path: "/api/v1/auth" });
}

export {
    setCookie,
    clearCookie
}