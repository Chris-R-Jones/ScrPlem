

module.exports = {

    // Interval (# ticks) that we'll run each lab production cycle.
    LABGROUP_RUN_LENGTH : 1000,

    // Interval (# ticks) that we'll delay for unload/terminal balancing
    // after a production run, before searching for a new product.
    // After that we'll wait a full LABGROUP_RUN_LENGTH if there is still
    // no product
    LABGROUP_BREATHER_LEN : 100,

    // Number of entries in labgoup history
    LABGROUP_HISTORY_SIZE : 15,

    // Average room mineral level required for a good to be considered
    // to be an input (or reagent) for a production.
    // Also used as a production target average level when deciding to 
    // product intermediate products.
    LABGROUP_REAGENT_MIN_LEVEL : 500,

    // Interval ( # turns ) we will take defensive actions after being
    // assaulted (visited by a hostile player creep).  This includes
    // defensive patrols and lab stocking (warPrep)
    GENERAL_ASSAULT_DEFENCE_DURATION : 200000,

};
