# Steps to manually start the substrate indexer in the server
# 1. start docker-compose in packages/manager
# 2. start manager server: packages/manager
# 3. start apollo query: packages/query

git clone https://github.com/massbitprotocol/substrate-indexer
cd substrate-indexer/packages/manager

# Install docker
sudo apt update
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository 'deb [arch=amd64] https://download.docker.com/linux/ubuntu bionic stable'
sudo apt update
apt-cache policy docker-ce
sudo apt install -y docker-ce docker-compose

# Start docker-compose
sudo docker-compose up -d

# Install yarn
curl -sS https://dl.yarnpkg.com/debian/pubkey.gpg | sudo apt-key add -
echo "deb https://dl.yarnpkg.com/debian/ stable main" | sudo tee /etc/apt/sources.list.d/yarn.list
sudo apt update
sudo apt install yarn -y

# Install node
sudo apt-get install npm
curl -fsSL https://deb.nodesource.com/setup_14.x | bash - && apt-get install -y nodejs 
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.38.0/install.sh | bash
source ~/.bashrc
nvm install v14.10.1

# Start manager
cd substrate-indexer/packages/manager
yarn install
tmux new -d -s manager yarn start:dev

# Start query
cd substrate-indexer/packages/query
yarn install
tmux new -d -s query yarn start:dev  

# Nginx
sudo apt install -y nginx
sudo snap install core; sudo snap refresh core
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/bin/certbot
sudo certbot --nginx # Setup Route53 point to server IP first. Use sub-index-staging.massbit.io, query.sub-index-staging.massbit.io point to the same IP.
sudo certbot -d sub-index-staging.massbit.io,query.sub-index-staging.massbit.io --expand  

# Point to correct port
cd /etc/nginx/sites-available
sudo vi default
    proxy_pass http://localhost:3000; # For manager
    proxy_pass http://localhost:3001; # For query

sudo nginx -s reload