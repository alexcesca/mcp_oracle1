FROM node:20-bullseye-slim

# Install system dependencies for Oracle Instant Client
RUN apt-get update && apt-get install -y \
    libaio1 \
    unzip \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Oracle Instant Client (Thick mode support for older DBs)
WORKDIR /opt/oracle
RUN wget --no-check-certificate https://download.oracle.com/otn_software/linux/instantclient/1919000/instantclient-basic-linux.x64-19.19.0.0.0dbru.zip \
    && unzip instantclient-basic-linux.x64-19.19.0.0.0dbru.zip \
    && rm instantclient-basic-linux.x64-19.19.0.0.0dbru.zip \
    && sh -c "echo /opt/oracle/instantclient_19_19 > /etc/ld.so.conf.d/oracle-instantclient.conf" \
    && ldconfig

# Set Oracle environment variables
ENV LD_LIBRARY_PATH=/opt/oracle/instantclient_19_19:$LD_LIBRARY_PATH
ENV ORACLE_CLIENT_LIB_DIR=/opt/oracle/instantclient_19_19

# Setup the Node.js application
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code and build
COPY . .
RUN npm run build

# Start the MCP server using stdio
CMD ["npm", "start"]
