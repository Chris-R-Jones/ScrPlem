var Preference      = require('Preference');
var Creep           = require('Creep');
var RoomHolder      = require('RoomHolder');
var PathMaker       = require('PathMaker');

// Role_SectorProbe
//   is a creep that is designed to walk around discovering room contents in the
// sector surrounding where it was spawned.  We intend to have one per sector,
// and so they are named according to the center room of the sector.

// teeny weenie
const BODY_M1 = [ MOVE ];
const BODY_M1_COST = 50;

class Role_SectorProbe extends Creep
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

        // Choose the body we want and will wait for energy for.
        if(room.energyCapacityAvailable >= BODY_M1_COST){
            body = BODY_M1;
            cost = BODY_M1_COST;
            max = 1;
        }
        else
            return true;

        // Wait for it, if not yet available
        if(room.energyAvailable < cost)
            return true;

        // Figure out center room name of this sector.  We'll use this to ensure
        // one sector probe per sector (based on name).
        let parsed = /^([WE])([0-9]+)([NS])([0-9]+)$/.exec(room.name);
        let fd = parsed[1];
        let fv = 10 * ( Math.floor(parsed[2] / 10) ) + 5;
        let sd = parsed[3];
        let sv = 10 * ( Math.floor(parsed[4] / 10) ) + 5;
        let centerRoomName = ""+fd+fv+sd+sv;

        // Skip this room - we don't have a very significant presence.
        if(centerRoomName == 'E5N35')
            return false;

        // Find a free name and spawn the bot.
        // No alt need, not time sensitive.
        let altTime = 0;
        let multispec = "" ;
        let crname = Creep.spawnCommon(spawn, 'sectProbe', body, max, altTime, multispec, centerRoomName, "global");

        // if null we must already have it.
        if(crname == null)
            return false;

        let crmem  = Memory.creeps[crname];

        // Initialze memory for the role.
        crmem.state = 'init';
        delete crmem.instance
        return true;
    };

    setNextRoom()
    {
	    let crmem = this.m_crmem;
	    let creep = this.m_creep;
        let croom = this.m_creep.room;

        // Find creep's home room
        let parsed = /^([WE])([0-9]+)([NS])([0-9]+)$/.exec(croom.name);
        let crfd = parsed[1];
        let crfv = Number(parsed[2]);
        let crsd = parsed[3];
        let crsv = Number(parsed[4]);

        // Scan rooms - In the same order as reading -- left-right, top to bottom.
        // but starting from the current room (whose position we just parsed)
        let nxfv = crfv;
        let nxsv = crsv;
        let tlfv;
        let tlsv;
        if(crmem.tlfv != null){
            tlfv = crmem.tlfv;
            tlsv = crmem.tlsv;
        }
        else {
            // Need to calculate this from the home room and save it, not current room.
            // (Since current room might be the right hand highway)
            tlfv = crmem.tlfv = 10*(Math.floor(crfv/10));
            tlsv = crmem.tlsv = 10*(Math.floor(crsv/10));
        }

        do {
            // Get coords of next room the check
            nxfv++;
            if(nxfv == tlfv+11){
                nxfv -= 11;
                nxsv++;
                if(nxsv == tlsv+11){
                    nxsv-=11;
                }
            }

            // Format next room name
            let nextRoomName = (""+crfd+nxfv +crsd+nxsv);

            crmem.nextRoomName = nextRoomName;

            // Avoid plotting routes to any rooms til we are sure we want to
            // go there.  First check if we care about visiting.
            // Get it's memory and determine if we should visit it.
            let rmem = Memory.rooms[nextRoomName];
            let interest = false;

            // If there's no memory at all, clearly yes.
            if(!rmem)
                interest = true;

            // If we haven't recorded vision time, or it has been 100000 ticks
            // since last visit, then yes.
            else if(!rmem.lastVisionT || (Game.time - rmem.lastVisionT)>100000)
                interest = true;

            // If the last visit (possibly an observer) found a sign mismatch
            // then yes.
            else if(rmem.needSign){
                // .. unless it's a hostile room.
                if(rmem.owner == 'none'
                   || rmem.owner == 'nouser'
                   || rmem.owner == 'me'
                   ){
                    interest = true;
                }
            }

            // If it's a source keeper room, or the center, generally no.
            // (unless we've just never been there)
            if(    (nxfv % 10 >= 4 && nxfv % 10 <= 6)
                && (nxsv % 10 >= 4 && nxsv % 10 <= 6)
                ){
                interest = false;
            }

            // Still interested? If not, continue.
            if(!interest)
                continue;

            // Else check to see if a route to this is safe.  If score is over 5,
            // then skip it as we'd have to travel through an unsafe room that
            // would surely kill this creep.
            let route = PathMaker.getSafeRoute(croom.name,nextRoomName,false);
            let danger;

            if(route == ERR_NO_PATH)
                danger = 666;
            else if(route && route.length >= 2)
                danger = PathMaker.getSafeRouteDanger(route);
            else if(route && route.length <= 2)
                danger = 1;
            if(danger > 5) {
                //console.log('Sector probe skipping dangerous route to '+nextRoomName+' danger='+danger);
                //console.log('.. pos: '+creep.pos);
                //console.log('.. route: '+JSON.stringify(route));
                continue;
            }
            //else {
            //    console.log('Approved sector probe route, danger='+danger);
            //    console.log('.. route: '+JSON.stringify(route));
            //}

        } while(nxfv != crfv || nxsv != crsv);
        return false;
    }

    // Logic callback invoked to have a creep run it's actions - derived from
    // base Creep class (a 'virtual function' or whatever you call it in JS).
	runLogic()
	{
	    let crmem = this.m_crmem;
	    let creep = this.m_creep;
	    let croom = creep.room;
	    let hRoom  = Game.rooms[crmem.homeName];
	    let hrObj  = RoomHolder.get(hRoom.name);
	    let rc;
	    let maxLoop = 5;
	    let exceed;
	    let si;
	    let debug="";

	    for(exceed=0; exceed<maxLoop; exceed++){
            debug=debug + '\t loop'+exceed+' state='+crmem.state+'\n';


            //if(creep.name == 'sectProbe_global_W5N5_0')
            //    console.log('T='+Game.time+' '+creep.name+' pos='+creep.pos+' state='+crmem.state+' next='+crmem.nextRoomName);

            switch(crmem.state){

            case 'init':
                crmem.state = 'findNextRoom';
                return;

            case 'findNextRoom':
                // Find next room to visit
                if(this.setNextRoom())
                    crmem.state = 'moveToRoom';
                else
                    crmem.state = 'idle';
                break;

            case 'moveToRoom':
                if(creep.pos.x != 0 && creep.pos.x != 49
                   && creep.pos.y !=0 && creep.pos.y != 49
                   && creep.room.controller){
                    let ctrl = creep.room.controller;
                    if(ctrl &&
                       (!ctrl.sign
                        || (ctrl.sign && ctrl.sign.username && ctrl.sign.username != creep.owner.username)
                       )
                      ){
                        this.setTarget(ctrl);
                        crmem.state = 'updateSign';
                        break;
                    }
                }

                if(this.actionMoveToRoomRouted(crmem.nextRoomName) == OK){
                    crmem.state = 'findNextRoom';
                    return;
                }
                return;

            case 'updateSign':
                let ctrl = Game.getObjectById(crmem.targetId);
                if(!ctrl){
                    this.clearTarget();
                    crmem.state = 'moveToRoom';
                    break;
                }
                if(creep.pos.getRangeTo(ctrl.pos) != 1){
                    this.actMoveTo(ctrl,{ maxRooms: 1, reusePath: 5});
                    return;
                }
                rc=creep.signController(ctrl,Preference.areaSignText);
                if(rc == OK){
                    this.clearTarget();
                    console.log('RE-SIGNED CONTROLLER IN '+creep.room.name);
                    crmem.state = 'moveToRoom';
                }
                return;

            case 'idle':
                if(!(crmem.idleRandom))
                    crmem.idleRandom = Math.floor(Math.random()*500);
                if( (Game.time % 500) == crmem.idleRandom)
                    crmem.state = 'findNextRoom';
                return;

            default:
                console.log('BUG! Unrecognized creep state='+crmem.state+' for creep='+creep.name);
                crmem.state = 'init';
                break;
            }
	    }
	    if(exceed == maxLoop)
	        console.log('BUG! '+creep.name+' exceeded max loops\n'+debug);
	}
}

module.exports = Role_SectorProbe;
