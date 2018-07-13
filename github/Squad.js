var Preference = require('Preference');
var RoomCoord  = require('RoomCoord');

const SQ_ORDER_INIT       = 0;
const SQ_ORDER_STAND_DOWN = 1;

class Squad
{

    // Invoked to reassign squad to a different division (including memory)
    // If division is null, the squad is in reserves.
    setDivision(division)
    {
        if(division){
            this.m_division = division;
            this.m_sqmem.divisionName = division.m_tgtRoomName;
        }
        else{
            delete this.m_sqmem.divisionName;
            this.m_division = null;
        }
    }

    // Invoked by owning division to set order to stand down.
    setOrderStandDown()
    {
        let sqmem = this.m_sqmem;
        if(sqmem)
            delete sqmem.divisionName;
        if(Preference.debugMilitary == 'verbose')
            console.log('Squad '+this.m_sqName+' returned to reserves, and set order to stand down.');
        this.m_order = SQ_ORDER_STAND_DOWN;
    }

    // Invoked to create a new squad object.  Generally to re-create an
    // object that was in Memory, but also when a new bot is spawned and
    // and assigned to a new squad.
    constructor(sqName, division)
    {
        let sqmem        = Memory.squads[sqName];
        this.m_sqName   = sqName;
        this.m_division = division;
        this.m_order    = SQ_ORDER_INIT;
        this.m_sqmem    = sqmem;
        if(!sqmem) {
            // Brand new division.  Register it in memory.
            let sqmem = Memory.squads[sqName] = {}
            if(division)
                sqmem.divisionName = division.m_tgtRoomName;
            else
                delete sqmem.divisionName;  // squad in reserves
            if(Preference.debugMilitary)
                console.log('T='+Game.time+' New squad instantiated for room '+division.m_tgtRoomName+' squadname='+sqName);
        }

        this.m_creeps = [];
        this.m_bodCt = {}
    };

    // Invoked by General when a new creep was found to be assigned to the division this squad is
    // a member of, to see if the creep should join this squad as well.
    needsNewCreep(nCrObj)
    {
        let ci;

        // Initially we'll just accept the creep if it's a different role
        // so that there's one of each type per squad
        if(Preference.debugMilitary == 'verbose')
            console.log('... Consider role='+nCrObj.m_crmem.role+' for squad '+this.m_sqName);
        for(ci=0; ci<this.m_creeps.length;ci++){
            let oCrObj = this.m_creeps[ci];
            if(Preference.debugMilitary == 'verbose')
                console.log('... ... member '+oCrObj.m_creep.name+' role='+oCrObj.m_crmem.role);
            if(oCrObj.m_crmem.role == nCrObj.m_crmem.role)
                return false;
        }
        return true;
    }

    // Invoked by General to link in creep that was found to be assigned to
    // this squad (from memory).
    addCreep(crObj)
    {
        this.m_creeps.push(crObj);
        crObj.m_crmem.squad = this.m_sqName;
        if(this.m_divison)
            crObj.m_crmem.division = this.m_division.m_tgtRoomName;
        else
            delete crObj.m_crmem.division;
        crObj.m_squad = this;

        let creep = crObj.m_creep;
        let body  = creep.body;

        for(let bi=0; bi<body.length; bi++){
            let bodEl = body[bi];
            let btype = bodEl.type;
            let boost = bodEl.boost;
            if(!this.m_bodCt[btype])
                this.m_bodCt[btype]=1;
            else
                this.m_bodCt[btype]++;

            let div = this.m_division;
            if(div){
                if(!(div.m_bodCt[btype]))
                    div.m_bodCt[btype]=1;
                else
                    div.m_bodCt[btype]++;
            }
        }
    }

    checkStandDown()
    {
        if(this.m_creeps.length == 0){
            if(Preference.debugMilitary)
            console.log('T='+Game.time+' Squad '+this.m_sqName+' stand down complete');
            delete Memory.squads[this.m_sqName];
        }
    }


    // Invoked each turn by division to let squad update its orders.
    giveOrders()
    {
        // Currently, we only do orders for squads in divisions with
        // attack orders, and only to calculate/advance/retreat the
        // squad rally position.
        // console.log('DBG squad '+this.m_sqName+' giveOrders()');
    }

    // Return linear distance between the room these creeps are in
    // and the passed room.  (used for example to see if the squad
    // should join a distant division
    roomDistance( fromRoom )
    {
        // So far we don't really have a 'lead' creep in the squad
        // although that's the long term goal.  Just pick a creep.
        if(this.m_creeps.length == 0)
            return 1000;
        let crObj = this.m_creeps[0];
        let crCoord = new RoomCoord(crObj.m_creep.room.name);
        let fromCoord = new RoomCoord(fromRoom);
        console.log('Squad '+this.m_sqName+' consider dist to '+fromRoom+' result = '+linearDist);
        let linearDist = (crCoord.xDist(fromCoord) + crCoord.yDist(fromCoord));
        return linearDist;
    }

};

module.exports = Squad;
