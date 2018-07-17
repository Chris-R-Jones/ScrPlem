import requests
import json
import os
from os.path import expanduser

# To upload, we need to stuff all the files in a JSON database
# See the following URL for the basic structure.  We're not using grunt.. but it does show
# the request format.
#     https://docs.screeps.com/commit.html
data = { 'branch': 'default'
       , 'modules': { }
       }

# All source should be in the ./src/ directory
dirlist = os.listdir("src/")
for file in dirlist:
    if file.endswith('.js'):
        # Screeps expects us to upload 'module names' not filenames.
        # Strip off the .js
        module = file[0:-3]
        if len(module) != 0:
            with open("src/"+file, "r") as f:
                filetext = f.read();
                data['modules'][module] = filetext;

if(len(data['modules'].keys()) == 0):
    print("No modules found to upload !?")
    exit(1)

# We'll authenticate with a screeps auth token.  See:
#    https://docs.screeps.com/auth-tokens.html
# It's expected that the token is stored in home directory as ~/.screepsAuthToken
home = expanduser("~")
with open((home+"/.screepsAuthToken"),"r") as tokenfile:
    token = tokenfile.read()

# Make the request for (all) user code.
r = requests.post(url='https://screeps.com/api/user/code?_token='+token.strip(), json=data);

print(r.text)

