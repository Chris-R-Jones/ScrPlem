var ChemController  = require('ChemController');
var Creep           = require('Creep');
var CreepMon        = require('CreepMon');
var Grafana	    	= require('Grafana');
var RoomObj         = require('RoomObj');
var Generalissimo   = require('Generalissimo');
var Util            = require('Util');
var PathMaker       = require('PathMaker');
var TerminalController = require('TerminalController');

/* Main loop */
module.exports.loop = function () {

    if(Game.cpu.bucket < 1000){
        console.log('T='+Game.time+' Skipping turn, bucket'+Game.cpu.bucket);
        return;
    }
    //console.log('T='+Game.time+' Processing turn');

    // Log initial stats
	Grafana.logInitial();

    // Analyze game objects / build objects to capture analysis
    CreepMon.newTick();
    RoomObj.newTick();
    Grafana.logMajorCPU('objectAnalysis');

    // Run room planner logic
    RoomObj.plannerLoop();
    Grafana.logMajorCPU('roomPlanner');

    // Run terminal balancing logic
    TerminalController.run();
    Grafana.logMajorCPU('terminalLoop');

    // Run labwork.
    //   Needs to run after terminal logic (which calculates global goods averages)
    //   Needs to run before creep logic (for chemist creeps to know what to do)
    ChemController.run();
    Grafana.logMajorCPU('chemistryLoop');

    // Run military planning by general
    Generalissimo.warRoom();
    Grafana.logMajorCPU('warRoom');

    // Run spawn logic
    RoomObj.spawnLoop();
    Grafana.logMajorCPU('spawnLoop');

    // Observer logic
    RoomObj.observerLoop();
    Grafana.logMajorCPU('observerLoop');

    // Run tower logic
    RoomObj.towerLoop();
    Grafana.logMajorCPU('towerLoop');

    // Run econ creep main logic loop
    CreepMon.econCreepLoop();
    Grafana.logMajorCPU('econCreepLoop');

    // Run test creeps finally after everything else.
    // So, if they bomb, the world goes on.
    CreepMon.testCreepLoop();
    Grafana.logMajorCPU('testCreepLoop');

    // Periodically clean old entries in the pathmaker safe route cache
    PathMaker.flushStaleRoutes();

    // Launch nukes if needed (TBD to move to better place than Util)
    Util.testNuker();

    // Final stats
	Grafana.logFinal();

    // If a manual room summary report was requested, generate it.
    if(Memory.roomReportFlag){
        RoomObj.roomSummaryReport();
        Memory.roomReportFlag = false;
    }

    // New/test routines go here last (in case they barf)
    //Util.testPathFinder();
    //delete Memory.safeCache['E7N44_E6N43'];
    //console.log('safeRoute: '+ JSON.stringify(PathMaker.getSafeRoute('E7N44','E6N43',true)));

}

