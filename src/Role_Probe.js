
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');


// Role_Probe is a simple bot that just moves to adjacent rooms to its
// home to probe for information when we don't have a presence in the
// neighbor rooms.

// teeny weenie
const BODY_M1 = [ MOVE ];
const BODY_M1_COST = 50;

class Role_Probe extends Creep
{
    // Constructor to allocate creep (construct after it's spawn implicitly
    // by CreepMon)
    constructor (creep, crmem)
    {
        super(creep, crmem);
    };

    static spawn( spawn ) {
        let room        = spawn.room;
        let controller  = room.controller;
        let body;
        let cost;
        let max;
        let hrObj  = RoomHolder.get(room.name);

        // Make sure room has reached L3 and at least 8 extensions.
        // (else bootstrappers cover us and there's little need yet
        if(controller.level < 3)
            return false;

        if(controller.level == 3) {
            let exten = hrObj.getExtensions();
            if(exten.length < 10)
                return false;
        }

        // Check neighbors to see if we have a presence in all of them.
        // If we do, no need to probe.
        let exits = Game.map.describeExits(room.name);
        let nrName;
        let dir;
        for(dir=1; dir <=7; dir+=2){
            nrName = exits[dir];
            if(!nrName)
                continue;

            // Don't spawn probe if we already have vision.
            let nrObj = RoomHolder.get(nrName);
            if(!nrObj)
                break;
            if(nrObj.m_room)
                continue;

            if(!nrObj.m_rmem)
                break;

            // If the room is a sector lane, with no controller, we don't need
            // to waste a probe for it.  Arguably we might want to for reactive
            // defence in future, but that's probably better served by observers
            // anyway.
            if(nrObj.m_rmem.owner == "none" && !nrObj.m_rmem.keeperRoom)
                continue;

            // If the room is hostile, we should visit every so often, but our probe might die -
            // only visit if we haven't been there recently.
            if(nrObj.m_rmem.hostileCt && (Game.time - nrObj.m_rmem.hostileLastT) < 1500 )
                continue;
            break;
        }

        if(dir > 7) {
            if(!hrObj.isCenterAccessRoom())
                return false;
        }

        // Don't spawn repair bots unless we are below the low watermark
        let rObj  = RoomHolder.get(room.name);

        // Choose the body we want and will wait for energy for.
        if(room.energyCapacityAvailable >= BODY_M1_COST){
            body = BODY_M1;
            cost = BODY_M1_COST;
            max = 1;
        }

        // Wait for it, if not yet available
        if(room.energyAvailable < cost)
            return true;

        // Find a free name and spawn the bot.
        // No alt need, not time sensitive.
        let crname = Creep.spawnCommon(spawn, 'probe', body, max, 0);

        // if null we must already have it.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        // Initialze memory for the role.
        crmem.state = 'pickNextRoom';
        crmem.nextRoom = TOP;
        delete crmem.instance
        return true;
    };


    // Logic callback invoked to have a creep run it's actions - derived from
    // base Creep class (a 'virtual function' or whatever you call it in JS).
	runLogic()
	{
	    let crmem = this.m_crmem;
	    let creep = this.m_creep;
	    let hRoom  = Game.rooms[crmem.homeName];
	    let hrObj  = RoomHolder.get(hRoom.name);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let debug="";

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';

            //if(creep.name == 'probe_W5N33_0')
            //    console.log(creep.name+' pos='+creep.pos+' state='+crmem.state+' nextRoom='+crmem.nextRoom+' nextName='+crmem.nextName);

            switch(crmem.state){

            case 'moveHome':
                rc=this.actionMoveToRoom(crmem.homeName);
                if(rc == OK) {
                    crmem.state = 'pickNextRoom';
                    break;
                }
                return;

            case 'pickNextRoom':
                let exits = Game.map.describeExits(hRoom.name);
                let neighRoomName;
                let loops;
                for(loops=0; loops <=1; loops++){
                    crmem.nextRoom = crmem.nextRoom+2;
                    crmem.nextName = exits[crmem.nextRoom];
                    if(crmem.nextRoom > LEFT){
                        crmem.nextRoom = TOP;
                        crmem.nextName = exits[TOP];
                        if(hrObj.isCenterAccessRoom()){
                            crmem.state = 'checkCenter';
                            return;
                        }
                    }
                    if(!crmem.nextName)
                        continue;

                    // Don't need to visit rooms that we already have vision in.
                    let nrObj = RoomHolder.get(crmem.nextName);
                    if(!nrObj)
                        break;
                    if(nrObj.m_room)
                        continue;
                    if(!nrObj.m_rmem)
                        break;

                    // If the room is hostile, we should visit every so often, but our probe might die - only visit if we haven't been there recently.
                    if(nrObj.m_rmem.hostileCt && (Game.time - nrObj.m_rmem.hostileLastT) < 1500 )
                        continue;
                    break;
                }
                if(loops == 2)
                    return;

                crmem.state = 'moveToRoom';
                return;

            case 'moveToRoom':
                if(!crmem.nextName){
                    crmem.state = 'pickNextRoom';
                    break;
                }
                rc = this.actionMoveToRoom(crmem.nextName);
                if(rc == OK){
                    // Refresh room hostile info.  If hostile, get out of here.
                    // else linger.
                    let cRoom = Game.rooms[creep.room.name];
                    let crObj = RoomHolder.get(creep.room.name);
                    let hostiles = crObj.getHostiles();

                    if(hostiles.length || crObj.getTowers())
                        crmem.state = 'moveHome';
                    else
                        crmem.state = 'linger';
                    break;
                }
                return;

           case 'checkCenter':
                let parsed = /^([WE])([0-9]+)([NS])([0-9]+)$/.exec(crmem.homeName);
                let fd = parsed[1];
                let fv = parsed[2];
                let sd = parsed[3];
                let sv = parsed[4];
                fv = Math.floor(fv/10)*10+5;
                sv = Math.floor(sv/10)*10+5;
                let center = ''+fd+fv+sd+sv;

                rc = this.actionMoveToRoom(center);
                if(rc==0){
                    crmem.state = 'lingerCenter';
                }
                return;

            case 'lingerCenter':
                if(!crmem.lingerCt)
                    crmem.lingerCt = 100;
                else
                    crmem.lingerCt--;
                if(crmem.lingerCt <= 0){
                    // Go on to the 'next' normal probe room.
                    crmem.state = 'moveToRoom';
                }
                return;


           case 'linger':
                if(!crmem.lingerCt)
                    crmem.lingerCt = 100;
                else
                    crmem.lingerCt--;
                if(crmem.lingerCt <= 0){
                    delete crmem.lingerCt;
                    crmem.state = 'moveHome';
                }
                return;

            default:
                console.log('BUG! Unrecognized creep state='+crmem.state+' for creep='+creep.name);
                crmem.state = 'pickEnergy';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_Probe;
