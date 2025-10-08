# SABA - A Personal AI Assistant

This is a Next.js project for a personal AI assistant named SABA, built using Next.js, Genkit, and ShadCN UI components.

## Prerequisites

Before you begin, ensure you have the following installed on your local machine:
- [Node.js](https://nodejs.org/) (version 20 or later recommended)
- [npm](https://www.npmjs.com/) (which comes with Node.js)
- [Docker](https://www.docker.com/products/docker-desktop)

## Running Locally

To run this project on your local system, follow these steps:

### 1. Install Dependencies

First, open a terminal in the project's root directory and install the necessary packages by running:

```bash
npm install
```

### 2. Set Up Environment Variables

The AI capabilities of this application are powered by the Google Gemini API. To use it, you need an API key.

1.  Create a new file named `.env` in the root of your project directory.
2.  Obtain a free API key from [Google AI Studio](https://aistudio.google.com/app/apikey).
3.  Add the API key to your `.env` file like this:

    ```
    GEMINI_API_KEY=your_api_key_here
    ```

    Replace `your_api_key_here` with the actual key you obtained.

### 3. Run Redis for Short-Term Memory

SABA uses Redis for short-term conversation memory. You can run a local Redis instance using Docker.

In a new terminal, run the following command:

```bash
docker run -d -p 6379:6379 redis
```

This will start a Redis container and map it to port 6379, which the application will connect to.

### 4. Run the Development Servers

This project requires two separate development servers to be running at the same time: one for the Next.js web application and one for the Genkit AI flows. Make sure your Redis container is running before starting the servers.

**Terminal 1: Run the Next.js App**

In your first terminal, start the web application:

```bash
npm run dev
```

This will typically start the application on `http://localhost:9002`.

**Terminal 2: Run the Genkit Flows**

In a second, separate terminal, start the Genkit development server:

```bash
npm run genkit:watch
```

This command watches your AI flow files for any changes and keeps the AI backend running.

Once both servers are running, you can open your web browser to `http://localhost:9002` to use the application. Enjoy experimenting with SABA!