import requests
import json
from os.path import expanduser

def parseModules( modDict ):
    if type(modDict) is not dict:
        print("Error parsing modules dictionary")
        exit(1)
    for key in modDict.keys():
        print("File: ",key)
        filePath = "src/"+key+".js"
        with open(filePath,"w") as f:
            f.write(modDict[key])

# We'll authenticate with a screeps auth token.  See:
#    https://docs.screeps.com/auth-tokens.html
# It's expected that the token is stored in home directory as ~/.screepsAuthToken
home = expanduser("~")
with open((home+"/.screepsAuthToken"),"r") as tokenfile:
    token = tokenfile.read()

# Make the request for (all) user code.
r = requests.get('https://screeps.com/api/user/code?_token='+token.strip());

# Comes back in a dictionary with all the source modules.
rdict = json.loads(r.text)
if type(rdict) is not dict:
    print("Error parsing response")
    print(r.text)
    exit(1)


print("----------------",rdict.keys())
for key in rdict.keys():
    if(key == 'modules'):
        parseModules(rdict['modules']);
    else:
        print("key ",key)
        print("value ",rdict[key])

