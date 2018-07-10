var Creep               = require('Creep');
var Grafana             = require('Grafana');

var Mil_Decon           = require('Mil_Decon');
var Mil_Healer          = require('Mil_Healer');
var Mil_Looter          = require('Mil_Looter');
var Mil_Omni            = require('Mil_Omni');
var Mil_AtkBoostDecon   = require('Mil_AtkBoostDecon');
var Mil_AtkBoostHeal    = require('Mil_AtkBoostHeal');

var Role_BootMover      = require('Role_BootMover');
var Role_Chemist        = require('Role_Chemist');
var Role_ClaimController= require('Role_ClaimController');
var Role_CtrlMover      = require('Role_CtrlMover');
var Role_CtrlUpgrade    = require('Role_CtrlUpgrade');
var Role_DediHarv       = require('Role_DediHarv');
var Role_Distributor    = require('Role_Distributor');
var Role_FRBootstrap    = require('Role_FRBootstrap');
var Role_Linker         = require('Role_Linker');
var Role_Mason          = require('Role_Mason');
var Role_Miner          = require('Role_Miner');
var Role_Minecart       = require('Role_Minecart');
var Role_MiniAttack     = require('Role_MiniAttack');
var Role_OptMover       = require('Role_OptMover');
var Role_NewRoomProbe   = require('Role_NewRoomProbe');
var Role_Probe          = require('Role_Probe');
var Role_Repair         = require('Role_Repair');
var Role_RemoteBootstrap= require('Role_RemoteBootstrap');
var Role_Reserve        = require('Role_Reserve');
var Role_SectorProbe    = require('Role_SectorProbe');
var Role_SK_Clear       = require('Role_SK_Clear');
var Role_Test           = require('Role_Test');
var Role_TowerFill      = require('Role_TowerFill');

var Role_TstHeal        = require('Role_TstHeal');
var Role_TstDecon       = require('Role_TstDecon');
var Role_TstGrunt       = require('Role_TstGrunt');

// Static members
var g_creeps = null;
var g_roleCounts = null;

// Role-aware monitor/manager of creep objects, instantiating the
// right object based on role (in memory) and coordinating their
// run loops.
class CreepMon {

    //-------------------------------------------------------------
    // Creep game/memory object analysis
    //-------------------------------------------------------------
    static newTick()
    {
        g_creeps = {}
        if(!Memory.creeps)
            Memory.creeps = {}

        g_roleCounts = { bootmove: 0
                       , chemist: 0
                       , claim: 0
                       , ctrlmov: 0
                       , ctrlupg: 0
                       , dharv: 0
                       , distrib: 0
                       , frboot: 0
                       , linker: 0
                       , mason: 0
                       , miner: 0
                       , minecart: 0
                       , miniatk: 0
                       , nrprobe: 0
                       , omover: 0
                       , probe: 0
                       , repair: 0
                       , remoteBoot: 0
                       , reserve: 0
                       , sectProbe: 0
                       , skclear: 0
                       , test: 0
                       , tfill: 0
                       , milDecon: 0
                       , milHeal: 0
                       , milLooter: 0
                       , milOmni: 0
                       , milAtkDecon: 0
                       , milAtkHeal: 0

                       , tstHeal: 0
                       , tstDecon: 0
                       , tstGrunt: 0
                       };

        let nCreeps = 0;

        for(let crName in Game.creeps){
            let creep = Game.creeps[crName];
            let crmem = Memory.creeps[crName];
            let creepObj = g_creeps[crName];

            if(!crmem){
                console.log('Creep '+crName+' no memory!?!? suicide!');
                creep.suicide();
                continue;
            }

            nCreeps++;

            if(creepObj)
                creepObj.refreshObj(creep,crmem);
            else {

                // Increase per-role counters
                if(! g_roleCounts[crmem.role] && g_roleCounts[crmem.role] != 0) {
                    console.log('Warning, uninitialized g_roleCounts for role='+crmem.role+' val='+g_roleCounts[crmem.role]);
                    g_roleCounts[crmem.role]=1;
                }
                else
                    g_roleCounts[crmem.role]++;

                switch(crmem.role){
                    case 'bootmove':
                        creepObj = new Role_BootMover(creep,crmem);
                        break;
                    case 'chemist':
                        creepObj = new Role_Chemist(creep, crmem);
                        break;
                    case 'claim':
                        creepObj = new Role_ClaimController(creep,crmem);
                        break;
                    case 'ctrlmov':
                        creepObj = new Role_CtrlMover(creep,crmem);
                        break;
                    case 'ctrlupg':
                        creepObj = new Role_CtrlUpgrade(creep,crmem);
                        break;
                    case 'dharv':
                        creepObj = new Role_DediHarv(creep,crmem);
                        break;
                    case 'distrib':
                        creepObj = new Role_Distributor(creep,crmem);
                        break;
                    case 'frboot':
                        creepObj = new Role_FRBootstrap(creep,crmem);
                        break;
                    case 'linker':
                        creepObj = new Role_Linker(creep,crmem);
                        break;
                    case 'mason':
                        creepObj = new Role_Mason(creep,crmem);
                        break;
                    case 'miner':
                        creepObj = new Role_Miner(creep,crmem);
                        break;
                    case 'minecart':
                        creepObj = new Role_Minecart(creep,crmem);
                        break;
                    case 'miniatk':
                        creepObj = new Role_MiniAttack(creep,crmem);
                        break;
                    case 'nrprobe':
                        creepObj = new Role_NewRoomProbe(creep,crmem);
                        break;
                    case 'omover':
                        creepObj = new Role_OptMover(creep,crmem);
                        break;
                    case 'probe':
                        creepObj = new Role_Probe(creep,crmem);
                        break;
                    case 'repair':
                        creepObj = new Role_Repair(creep,crmem);
                        break;
                    case 'remoteBoot':
                        creepObj = new Role_RemoteBootstrap(creep,crmem);
                        break;
                    case 'reserve':
                        creepObj = new Role_Reserve(creep,crmem);
                        break;
                    case 'sectProbe':
                        creepObj = new Role_SectorProbe(creep,crmem);
                        break;
                    case 'skclear':
                        creepObj = new Role_SK_Clear(creep,crmem);
                        break;
                    case 'test':
                        creepObj = new Role_Test(creep,crmem);
                        break;
                    case 'tfill':
                        creepObj = new Role_TowerFill(creep,crmem);
                        break;

                    case 'milDecon':
                        creepObj = new Mil_Decon(creep,crmem);
                        break;
                    case 'milHeal':
                        creepObj = new Mil_Healer(creep,crmem);
                        break;
                    case 'milLooter':
                        creepObj = new Mil_Looter(creep,crmem);
                        break;
                    case 'milOmni':
                        creepObj = new Mil_Omni(creep,crmem);
                        break;
                    case 'milAtkDecon':
                        creepObj = new Mil_AtkBoostDecon(creep,crmem);
                        break;
                    case 'milAtkHeal':
                        creepObj = new Mil_AtkBoostHeal(creep,crmem);
                        break;

                    case 'tstHeal':
                        creepObj = new Role_TstHeal(creep,crmem);
                        break;
                    case 'tstDecon':
                        creepObj = new Role_TstDecon(creep,crmem);
                        break;
                    case 'tstGrunt':
                        creepObj = new Role_TstGrunt(creep,crmem);
                        break;

                    default:
                        console.log('BUG! no newTick() entry for role='
                                    +crmem.role
                                    );
                        break;
                }
                g_creeps[crName] = creepObj;
            }
        }
        Grafana.logNCreeps(nCreeps, g_roleCounts);

        // Search for creeps that are dead, and clean them up.
        for(let crName in Memory.creeps){
            if(Game.creeps[crName])
                continue;
            delete Memory.creeps[crName];
        }
    };


    // get a creep based on name
    static get( crName ) {
        return g_creeps[crName];
    }

	//-------------------------------------------------------------
    // Creep logic main loop.
    //----------------------------------------------------------------------

	// Invoked once per tick to loop through all economy creeps, processing
	// their actions.
	static econCreepLoop()
	{
	    for(let crName in g_creeps){
	        let creepObj = g_creeps[crName];

	        // Don't run 'test' creep logic.  See testCreepLoop
	        if(creepObj.m_crmem.role == 'test')
	            continue;
	        if(creepObj.m_creep.spawning)
	            continue;
	        creepObj.runLogic();
	    }
	}

	// Invoked once per tick to loop through test creep actions.
	// (This allows us to do testing without impacting other creep activities.)
	static testCreepLoop()
	{
	    for(let crName in g_creeps){
	        let creepObj = g_creeps[crName];

	        if(creepObj.m_crmem.role != 'test')
	            continue;
	        if(creepObj.m_creep.spawning)
	            continue;
	        creepObj.runLogic();
	    }
	}
};


module.exports = CreepMon;
