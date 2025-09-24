# GenAPI Agent

## Setup and Run Locally

These instructions will guide you on how to set up and run the GenAPI Agent on your local machine.

### Prerequisites

Before you begin, ensure you have the following installed:

*   [Python 3.12+](https://www.python.org/)
*   [uv](https://docs.astral.sh/uv/getting-started/installation/)

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/spjohn85/genapi
    cd agent
    ```

2.  **Install dependencies:**

    ```bash
    ./setup
    ```
3. **Setup the environment variables:**

    `GEMINI_API_KEY`  `GIT_TOKEN` `ARIZE_API_KEY`

4. **Run the agent:**
    
    Use the following to use inbuilt adk UI

    ```bash
    adk web
    ```

    Or use the following to run along with custom UI

    ```bash
    python main.py
    ```
