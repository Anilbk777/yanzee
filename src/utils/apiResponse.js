const ApiResponse = (res, { statusCode = 200, message = "Success", data = null }) => {

    const response = {
        success: true,
        statusCode,
        message
    }
    if (data !== null) {
        response.data = data
    }
    res.status(statusCode).json(response)


}

export default ApiResponse
