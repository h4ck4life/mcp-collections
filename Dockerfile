FROM ghcr.io/open-webui/mcpo:main

# Install necessary dependencies for downloading and extracting Go
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Go 1.24
RUN wget https://go.dev/dl/go1.24.2.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.24.2.linux-amd64.tar.gz \
    && rm go1.24.2.linux-amd64.tar.gz

# Add Go to PATH
ENV PATH="/usr/local/go/bin:${PATH}"

# Verify Go installation
RUN go version
